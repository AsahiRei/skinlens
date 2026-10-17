import type { RecommendedProduct, Result, ResultData } from "@/types/schema";
import { supabase } from "@/utils/supabase";

import { requireUser } from "./auth";
import { getDatabase } from "./database";
import { isMissingColumnError } from "./pg-errors";
import { enqueueSync, hasPendingSync } from "./sync-queue";

function now() {
  return new Date().toISOString();
}

function swallow(p: PromiseLike<unknown>) {
  Promise.resolve(p).catch(() => {});
}

// Columns that exist on the Supabase `results` table. `confidence`,
// `detection_label` and `survey_answers` were device-only until migration
// 0007 added them server-side — when the server predates that migration the
// insert is retried without them (see insertResult) so a write never fails
// just because the schema is behind.
//
// The validation fields (validation_status / doctor_notes / validated_by /
// validated_at) are deliberately NEVER sent from the patient client: only
// the validate_ai_result() RPC writes them, so a patient sync can never
// clobber a dermatologist's review.
function toServerResultPayload(
  result: {
    user_id: string;
    severity: string;
    description: string;
    healthscore: number;
    image_url?: string | null;
    source_type?: string;
    recommendations: RecommendedProduct[] | null;
    confidence?: number | null;
    detection_label?: string | null;
    survey_answers?: string | null;
  },
  opts: { includeScanFields?: boolean } = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    user_id: result.user_id,
    severity: result.severity,
    description: result.description,
    healthscore: result.healthscore,
    image_url: result.image_url ?? null,
    source_type: result.source_type ?? "ai_generated",
    recommendations: result.recommendations,
  };
  if (opts.includeScanFields !== false) {
    payload.confidence = result.confidence ?? null;
    payload.detection_label = result.detection_label ?? null;
    payload.survey_answers = result.survey_answers ?? null;
  }
  return payload;
}

// Monotonic negative temp ids for rows created while the server insert
// fails. Initialized below every id already in the table so temp ids stay
// unique across app restarts (the old Math.min(max,0)-1 scheme always
// produced -1 and each offline insert overwrote the previous one).
//
// Scoped to the WHOLE table, not the current user: `id` is the primary key
// and is shared by every row, so an id that belongs to another (or to an
// 'anonymous') row would make the ON CONFLICT upsert below overwrite it.
let nextTempId: number | null = null;

async function getNextTempId(): Promise<number> {
  if (nextTempId === null) {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ min_id: number | null }>(
      `SELECT MIN(id) as min_id FROM results`,
    );
    nextTempId = Math.min(row?.min_id ?? 0, 0);
  }
  nextTempId -= 1;
  return nextTempId;
}

const RESULT_COLUMNS =
  "id, user_id, severity, description, healthscore, image_url, source_type, recommendations, created_at, confidence, detection_label, survey_answers";

const UPSERT_RESULT_SQL = `INSERT INTO results (id, user_id, severity, description, healthscore, image_url, source_type, recommendations, created_at, synced_at, confidence, detection_label, survey_answers)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
 ON CONFLICT(id) DO UPDATE SET
   user_id = excluded.user_id,
   severity = excluded.severity,
   description = excluded.description,
   healthscore = excluded.healthscore,
   image_url = COALESCE(excluded.image_url, results.image_url),
   source_type = excluded.source_type,
   recommendations = excluded.recommendations,
   created_at = excluded.created_at,
   synced_at = excluded.synced_at,
   confidence = COALESCE(excluded.confidence, results.confidence),
   detection_label = COALESCE(excluded.detection_label, results.detection_label),
   survey_answers = COALESCE(excluded.survey_answers, results.survey_answers)`;

// Server-refresh upsert: same columns plus the dermatologist-validation
// fields, which only ever come back from a server read (the patient client
// never writes them — see toServerResultPayload). Used when a Supabase
// SELECT is mirrored into the local cache, so validation reached on the
// server (doctor reviewed on another device) shows up here too.
const UPSERT_RESULT_SERVER_SQL = `INSERT INTO results (id, user_id, severity, description, healthscore, image_url, source_type, recommendations, created_at, synced_at, confidence, detection_label, survey_answers, validation_status, doctor_notes, validated_by, validated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
 ON CONFLICT(id) DO UPDATE SET
   user_id = excluded.user_id,
   severity = excluded.severity,
   description = excluded.description,
   healthscore = excluded.healthscore,
   image_url = COALESCE(excluded.image_url, results.image_url),
   source_type = excluded.source_type,
   recommendations = excluded.recommendations,
   created_at = excluded.created_at,
   synced_at = excluded.synced_at,
   confidence = COALESCE(excluded.confidence, results.confidence),
   detection_label = COALESCE(excluded.detection_label, results.detection_label),
   survey_answers = COALESCE(excluded.survey_answers, results.survey_answers),
   validation_status = COALESCE(excluded.validation_status, results.validation_status),
   doctor_notes = excluded.doctor_notes,
   validated_by = excluded.validated_by,
   validated_at = excluded.validated_at`;

/** A row exactly as returned by `select("*")` from Supabase. */
type ServerResultRow = {
  id: number;
  user_id: string;
  severity: string;
  description: string;
  healthscore: number;
  image_url: string | null;
  source_type: string;
  recommendations: unknown;
  created_at: string;
  confidence?: number | null;
  detection_label?: string | null;
  survey_answers?: string | null;
  validation_status?: string | null;
  doctor_notes?: string | null;
  validated_by?: string | null;
  validated_at?: string | null;
};

// PostgREST row → params for UPSERT_RESULT_SERVER_SQL. Validation fields
// fall back to null on servers that predate migration 0007, and the SQL's
// COALESCE keeps whatever the local row already had in that case.
function serverRowParams(row: ServerResultRow): (string | number | null)[] {
  return [
    row.id,
    row.user_id,
    row.severity,
    row.description,
    row.healthscore,
    row.image_url ?? null,
    row.source_type,
    row.recommendations ? JSON.stringify(row.recommendations) : null,
    row.created_at,
    now(),
    row.confidence ?? null,
    row.detection_label ?? null,
    row.survey_answers ?? null,
    row.validation_status ?? null,
    row.doctor_notes ?? null,
    row.validated_by ?? null,
    row.validated_at ?? null,
  ];
}

// ── Batched server→cache mirroring ────────────────────────────────────────
// Every read path used to run ONE statement per fetched row through the
// globally serialized SQLite handle — 200 rows = 200 queued round trips on
// every screen focus. Multi-row VALUES (chunked well under SQLite's
// guaranteed 999-parameter floor) collapses that to a handful of statements
// while keeping the exact same ON CONFLICT semantics.
const SERVER_UPSERT_COLUMNS = `id, user_id, severity, description, healthscore, image_url, source_type, recommendations, created_at, synced_at, confidence, detection_label, survey_answers, validation_status, doctor_notes, validated_by, validated_at`;

const SERVER_UPSERT_SET = `user_id = excluded.user_id,
   severity = excluded.severity,
   description = excluded.description,
   healthscore = excluded.healthscore,
   image_url = COALESCE(excluded.image_url, results.image_url),
   source_type = excluded.source_type,
   recommendations = excluded.recommendations,
   created_at = excluded.created_at,
   synced_at = excluded.synced_at,
   confidence = COALESCE(excluded.confidence, results.confidence),
   detection_label = COALESCE(excluded.detection_label, results.detection_label),
   survey_answers = COALESCE(excluded.survey_answers, results.survey_answers),
   validation_status = COALESCE(excluded.validation_status, results.validation_status),
   doctor_notes = excluded.doctor_notes,
   validated_by = excluded.validated_by,
   validated_at = excluded.validated_at`;

/** Params per row of UPSERT_RESULT_SERVER_SQL. */
const SERVER_UPSERT_PARAMS_PER_ROW = 17;

/**
 * Upper bound on rows pulled down per read. History screens render ~30 rows
 * and Progress/Report top out well below this; without a cap every focus
 * re-downloads the patient's entire scan history (with its recommendation
 * JSON) and mirrors it row by row.
 */
const RESULTS_FETCH_LIMIT = 200;
/** 40 × 17 = 680 params — under the 999 guaranteed by every SQLite build. */
const SERVER_UPSERT_CHUNK = 40;

function serverUpsertSql(rowCount: number): string {
  const tuple = `(${new Array(SERVER_UPSERT_PARAMS_PER_ROW).fill("?").join(", ")})`;
  return `INSERT INTO results (${SERVER_UPSERT_COLUMNS})
 VALUES ${new Array(rowCount).fill(tuple).join(", ")}
 ON CONFLICT(id) DO UPDATE SET
   ${SERVER_UPSERT_SET}`;
}

/** Mirrors server rows into the local cache in batched statements. */
async function upsertServerRows(
  db: Awaited<ReturnType<typeof getDatabase>>,
  rows: ServerResultRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += SERVER_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + SERVER_UPSERT_CHUNK);
    const params: (string | number | null)[] = [];
    for (const row of chunk) params.push(...serverRowParams(row));
    await db.runAsync(serverUpsertSql(chunk.length), params);
  }
}

function rowToResult(row: {
  id: number;
  user_id: string;
  severity: string;
  description: string;
  healthscore: number;
  image_url: string | null;
  source_type: string;
  recommendations: string | null;
  created_at: string;
  confidence?: number | null;
  detection_label?: string | null;
  survey_answers?: string | null;
  validation_status?: string | null;
  doctor_notes?: string | null;
  validated_by?: string | null;
  validated_at?: string | null;
}): Result {
  return {
    id: row.id,
    severity: row.severity,
    description: row.description,
    healthscore: row.healthscore,
    image_url: row.image_url,
    source_type: row.source_type,
    recommendations: row.recommendations
      ? JSON.parse(row.recommendations)
      : null,
    user_id: row.user_id,
    created_at: row.created_at,
    confidence: row.confidence ?? null,
    detection_label: row.detection_label ?? null,
    survey_answers: row.survey_answers ?? null,
    validation_status: (row.validation_status as Result["validation_status"]) ?? null,
    doctor_notes: row.doctor_notes ?? null,
    validated_by: row.validated_by ?? null,
    validated_at: row.validated_at ?? null,
  };
}

export async function getLatestResult(): Promise<Result | null> {
  const user = await requireUser();
  const db = await getDatabase();

  // Ordered by created_at rather than id: rows created offline carry
  // NEGATIVE temp ids that sort below every synced row, so `ORDER BY id DESC`
  // handed back the previous scan right after a fresh offline one.
  const local = await db.getFirstAsync<{
    id: number;
    user_id: string;
    severity: string;
    description: string;
    healthscore: number;
    image_url: string | null;
    source_type: string;
    recommendations: string | null;
    created_at: string;
    confidence: number | null;
    detection_label: string | null;
    survey_answers: string | null;
  }>(`SELECT * FROM results WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`, [
    user.id,
  ]);

  if (local) {
    swallow(
      (async () => {
        const { data } = await supabase
          .from("results")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          await db.runAsync(UPSERT_RESULT_SERVER_SQL, serverRowParams(data));
        }
      })(),
    );
    return rowToResult(local);
  }

  try {
    const { data, error } = await supabase
      .from("results")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    await db.runAsync(UPSERT_RESULT_SERVER_SQL, serverRowParams(data));
    return data as Result;
  } catch {
    return null;
  }
}

export async function getLatestResultDetail(): Promise<ResultData | null> {
  const result = await getLatestResult();
  if (!result) return null;
  return {
    severity: result.severity,
    description: result.description,
    healthscore: result.healthscore,
    recommendations: result.recommendations,
  };
}

export async function getAllResults(): Promise<Result[]> {
  const user = await requireUser();
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    id: number;
    user_id: string;
    severity: string;
    description: string;
    healthscore: number;
    image_url: string | null;
    source_type: string;
    recommendations: string | null;
    created_at: string;
    confidence: number | null;
    detection_label: string | null;
    survey_answers: string | null;
  }>(`SELECT * FROM results WHERE user_id = ? ORDER BY created_at DESC`, [
    user.id,
  ]);

  if (rows.length === 0) {
    // No local results — fetch from server and cache
    try {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(RESULTS_FETCH_LIMIT);
      if (error) throw error;
      if (data && data.length > 0) {
        await upsertServerRows(db, data);
        // Re-read from local after caching
        const cached = await db.getAllAsync<{
          id: number;
          user_id: string;
          severity: string;
          description: string;
          healthscore: number;
          image_url: string | null;
          source_type: string;
          recommendations: string | null;
          created_at: string;
          confidence: number | null;
          detection_label: string | null;
          survey_answers: string | null;
        }>(`SELECT * FROM results WHERE user_id = ? ORDER BY created_at DESC`, [
          user.id,
        ]);
        return cached.map(rowToResult);
      }
    } catch {
      // Fall through to return empty
    }
  }

  // Always try to refresh from server in background
  swallow(
    (async () => {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(RESULTS_FETCH_LIMIT);
      if (error) throw error;
      if (data && data.length > 0) {
        await upsertServerRows(db, data);
      }
    })(),
  );

  return rows.map(rowToResult);
}

export async function getThisWeekResults(): Promise<Result[]> {
  const user = await requireUser();
  const db = await getDatabase();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoISO = weekAgo.toISOString();

  const rows = await db.getAllAsync<{
    id: number;
    user_id: string;
    severity: string;
    description: string;
    healthscore: number;
    image_url: string | null;
    source_type: string;
    recommendations: string | null;
    created_at: string;
    confidence: number | null;
    detection_label: string | null;
    survey_answers: string | null;
  }>(
    `SELECT * FROM results WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC`,
    [user.id, weekAgoISO],
  );

  if (rows.length === 0) {
    // No local results for this week — fetch from server and cache
    try {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", weekAgoISO)
        .order("created_at", { ascending: false })
        .limit(RESULTS_FETCH_LIMIT);
      if (error) throw error;
      if (data && data.length > 0) {
        await upsertServerRows(db, data);
        const cached = await db.getAllAsync<{
          id: number;
          user_id: string;
          severity: string;
          description: string;
          healthscore: number;
          image_url: string | null;
          source_type: string;
          recommendations: string | null;
          created_at: string;
          confidence: number | null;
          detection_label: string | null;
          survey_answers: string | null;
        }>(
          `SELECT * FROM results WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC`,
          [user.id, weekAgoISO],
        );
        return cached.map(rowToResult);
      }
    } catch {
      // Fall through
    }
  }

  // Always try to refresh from server in background
  swallow(
    (async () => {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", weekAgoISO)
        .order("created_at", { ascending: false })
        .limit(RESULTS_FETCH_LIMIT);
      if (error) throw error;
      if (data && data.length > 0) {
        await upsertServerRows(db, data);
      }
    })(),
  );

  return rows.map(rowToResult);
}

export async function insertResult(result: {
  severity: string;
  description: string;
  healthscore: number;
  recommendations: RecommendedProduct[] | null;
  image_url?: string | null;
  local_image_uri?: string | null;
  source_type?: string;
  confidence?: number | null;
  detection_label?: string | null;
  survey_answers?: string | null;
}): Promise<Result> {
  const db = await getDatabase();
  const sourceType = result.source_type ?? "ai_generated";

  let user: { id: string };
  try {
    user = await requireUser();
  } catch {
    user = { id: "anonymous" };
  }

  if (__DEV__) {
    console.log("[insertResult] image_url:", result.image_url, "user:", user.id);
  }

  // Full server payload: core columns plus the scan fields that used to be
  // device-only. When the server predates migration 0007 the insert is
  // retried without them so the row still lands, and a follow-up entry is
  // queued so the scan fields sync as soon as the migration is applied.
  const serverPayload = {
    user_id: user.id,
    severity: result.severity,
    description: result.description,
    healthscore: result.healthscore,
    image_url: result.image_url ?? null,
    source_type: sourceType,
    recommendations: result.recommendations,
    confidence: result.confidence ?? null,
    detection_label: result.detection_label ?? null,
    survey_answers: result.survey_answers ?? null,
  };

  let serverResult: Result;
  try {
    let data: Record<string, unknown>;
    try {
      const res = await supabase
        .from("results")
        .insert(toServerResultPayload(serverPayload))
        .select()
        .single();
      if (res.error) throw res.error;
      data = res.data as Record<string, unknown>;
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      console.warn(
        "[insertResult] server missing scan columns (apply supabase/migrations/0007_result_validation.sql), inserting core row only",
        err,
      );
      const res = await supabase
        .from("results")
        .insert(
          toServerResultPayload(serverPayload, { includeScanFields: false }),
        )
        .select()
        .single();
      if (res.error) throw res.error;
      data = res.data as Record<string, unknown>;
      // Queue the full payload under the real server id so confidence /
      // detection_label / survey_answers flow up on the next sync pass.
      if (user.id !== "anonymous" && typeof data.id === "number") {
        swallow(
          enqueueSync("results", "upsert", String(data.id), {
            id: data.id,
            ...serverPayload,
          }),
        );
      }
    }
    if (__DEV__) {
      console.log("[insertResult] Supabase insert success, id:", data.id);
    }
    serverResult = {
      ...(data as Result),
      confidence: result.confidence ?? null,
      detection_label: result.detection_label ?? null,
      survey_answers: result.survey_answers ?? null,
    };
  } catch (err) {
    console.warn(
      "[insertResult] Supabase insert failed, queuing for sync:",
      err,
    );
    const tempId = await getNextTempId();
    serverResult = {
      id: tempId,
      user_id: user.id,
      severity: result.severity,
      description: result.description,
      healthscore: result.healthscore,
      image_url: result.image_url ?? null,
      source_type: sourceType,
      recommendations: result.recommendations,
      created_at: now(),
      confidence: result.confidence ?? null,
      detection_label: result.detection_label ?? null,
      survey_answers: result.survey_answers ?? null,
    };
    // Rows attributed to "anonymous" (no session) can never satisfy server
    // RLS — keep them device-local only instead of queueing an entry that
    // fails on every sync pass.
    if (user.id !== "anonymous") {
      await enqueueSync("results", "upsert", String(tempId), {
        id: tempId,
        user_id: user.id,
        severity: result.severity,
        description: result.description,
        healthscore: result.healthscore,
        image_url: result.image_url ?? result.local_image_uri ?? null,
        source_type: sourceType,
        recommendations: result.recommendations,
        confidence: result.confidence ?? null,
        detection_label: result.detection_label ?? null,
        survey_answers: result.survey_answers ?? null,
      });
    }
  }

  const localImageUrl =
    serverResult.image_url ?? result.local_image_uri ?? null;

  await db.runAsync(UPSERT_RESULT_SQL, [
    serverResult.id,
    serverResult.user_id,
    serverResult.severity,
    serverResult.description,
    serverResult.healthscore,
    localImageUrl,
    serverResult.source_type,
    serverResult.recommendations
      ? JSON.stringify(serverResult.recommendations)
      : null,
    serverResult.created_at,
    now(),
    serverResult.confidence ?? null,
    serverResult.detection_label ?? null,
    serverResult.survey_answers ?? null,
  ]);
  return serverResult;
}

/**
 * Re-homes scans taken while the session was missing. insertResult stores
 * those rows under `user_id = 'anonymous'` (and never queues them, because
 * RLS would reject them forever), while every read filters on the signed-in
 * id — so without this the offline scan simply never appears after login.
 *
 * Runs at the start of every sync pass (cheap no-op when there is nothing to
 * claim) and queues the rows under their real temp ids so they reach the
 * server too.
 */
export async function claimAnonymousResults(): Promise<void> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    severity: string;
    description: string;
    healthscore: number;
    image_url: string | null;
    source_type: string;
    recommendations: string | null;
    created_at: string;
    confidence: number | null;
    detection_label: string | null;
    survey_answers: string | null;
  }>(`SELECT * FROM results WHERE user_id = 'anonymous' LIMIT 50`);
  if (rows.length === 0) return;

  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return; // still signed out — claim again on the next pass
  }

  // Temp-id allocation must now see these rows' negative ids.
  nextTempId = null;

  for (const row of rows) {
    if (row.id >= 0) {
      // A positively-id'd row can only exist from a past session; leave it
      // alone rather than risk colliding with the server id of another user.
      await db.runAsync(`UPDATE results SET user_id = ? WHERE id = ?`, [
        userId,
        row.id,
      ]);
      continue;
    }
    if (await hasPendingSync("results", String(row.id))) continue;
    await db.runAsync(`UPDATE results SET user_id = ? WHERE id = ?`, [
      userId,
      row.id,
    ]);
    let recommendations: RecommendedProduct[] | null = null;
    if (row.recommendations) {
      try {
        const parsed = JSON.parse(row.recommendations);
        if (Array.isArray(parsed)) recommendations = parsed;
      } catch {
        /* unreadable cache — push the row without recommendations */
      }
    }
    await enqueueSync("results", "upsert", String(row.id), {
      id: row.id,
      user_id: userId,
      severity: row.severity,
      description: row.description,
      healthscore: row.healthscore,
      image_url: row.image_url,
      source_type: row.source_type,
      recommendations,
      created_at: row.created_at,
      confidence: row.confidence,
      detection_label: row.detection_label,
      survey_answers: row.survey_answers,
    });
  }
}
