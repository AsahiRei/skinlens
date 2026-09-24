import type { RecommendedProduct, Result, ResultData } from "@/types/schema";
import { supabase } from "@/utils/supabase";

import { requireUser } from "./auth";
import { getDatabase } from "./database";
import { enqueueSync } from "./sync-queue";

function now() {
  return new Date().toISOString();
}

function swallow(p: PromiseLike<unknown>) {
  Promise.resolve(p).catch(() => {});
}

// Columns that exist on the Supabase `results` table. `confidence`,
// `detection_label` and `survey_answers` are local-only until a server
// migration adds them — sending them to Supabase fails the whole insert,
// so every server payload must be filtered through toServerResultPayload.
function toServerResultPayload(result: {
  user_id: string;
  severity: string;
  description: string;
  healthscore: number;
  image_url?: string | null;
  source_type?: string;
  recommendations: RecommendedProduct[] | null;
}): Record<string, unknown> {
  return {
    user_id: result.user_id,
    severity: result.severity,
    description: result.description,
    healthscore: result.healthscore,
    image_url: result.image_url ?? null,
    source_type: result.source_type ?? "ai_generated",
    recommendations: result.recommendations,
  };
}

// Monotonic negative temp ids for rows created while the server insert
// fails. Initialized below every id already in the table so temp ids stay
// unique across app restarts (the old Math.min(max,0)-1 scheme always
// produced -1 and each offline insert overwrote the previous one).
let nextTempId: number | null = null;

async function getNextTempId(userId: string): Promise<number> {
  if (nextTempId === null) {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ min_id: number | null }>(
      `SELECT MIN(id) as min_id FROM results WHERE user_id = ?`,
      [userId],
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
  };
}

export async function getLatestResult(): Promise<Result | null> {
  const user = await requireUser();
  const db = await getDatabase();

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
  }>(`SELECT * FROM results WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [
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
          await db.runAsync(UPSERT_RESULT_SQL, [
            data.id,
            data.user_id,
            data.severity,
            data.description,
            data.healthscore,
            data.image_url ?? null,
            data.source_type,
            data.recommendations ? JSON.stringify(data.recommendations) : null,
            data.created_at,
            now(),
            data.confidence ?? null,
            data.detection_label ?? null,
            data.survey_answers ?? null,
          ]);
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

    await db.runAsync(UPSERT_RESULT_SQL, [
      data.id,
      data.user_id,
      data.severity,
      data.description,
      data.healthscore,
      data.image_url ?? null,
      data.source_type,
      data.recommendations ? JSON.stringify(data.recommendations) : null,
      data.created_at,
      now(),
      data.confidence ?? null,
      data.detection_label ?? null,
      data.survey_answers ?? null,
    ]);
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        for (const row of data) {
          await db.runAsync(UPSERT_RESULT_SQL, [
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
          ]);
        }
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        for (const row of data) {
          await db.runAsync(UPSERT_RESULT_SQL, [
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
          ]);
        }
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        for (const row of data) {
          await db.runAsync(UPSERT_RESULT_SQL, [
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
          ]);
        }
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        for (const row of data) {
          await db.runAsync(UPSERT_RESULT_SQL, [
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
          ]);
        }
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

  console.log("[insertResult] image_url:", result.image_url, "user:", user.id);

  let serverResult: Result;
  try {
    const { data, error } = await supabase
      .from("results")
      .insert(
        toServerResultPayload({
          user_id: user.id,
          severity: result.severity,
          description: result.description,
          healthscore: result.healthscore,
          image_url: result.image_url ?? null,
          source_type: sourceType,
          recommendations: result.recommendations,
        }),
      )
      .select()
      .single();
    if (error) throw error;
    console.log("[insertResult] Supabase insert success, id:", data.id);
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
    const tempId = await getNextTempId(user.id);
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
