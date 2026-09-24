import { supabase, validateSession } from "@/utils/supabase";
import { uploadImageToCloudinary } from "@/utils/cloudinary";

import { handleInvalidSession } from "./auth";
import { getDatabase } from "./database";
import { dequeueSync, removeSyncEntry } from "./sync-queue";

function isAuthSyncError(err: unknown): boolean {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: unknown }).status
      : null;
  if (status === 401 || status === 403) return true;
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  // Supabase auth errors: invalid JWT / user gone. PostgREST may surface
  // these as PGRST301 or via message text.
  if (code === "PGRST301") return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err ?? "").toLowerCase();
  return (
    msg.includes("jwt") ||
    msg.includes("user_not_found") ||
    msg.includes("user from sub claim") ||
    msg.includes("does not exist") ||
    msg.includes("not authenticated") ||
    msg.includes("invalid token") ||
    msg.includes("token revoked") ||
    msg.includes("refresh token")
  );
}

export async function processSyncQueue(): Promise<void> {
  // SyncManager (mount) and network transitions can trigger this
  // concurrently; without a guard two passes would pick up and double-apply
  // the same queue rows.
  if (processing) return;
  processing = true;
  try {
    await processSyncQueueInner();
  } finally {
    processing = false;
  }
}

let processing = false;

async function processSyncQueueInner(): Promise<void> {
  // Deleted-user guard: the cached AsyncStorage session may belong to an
  // account that no longer exists. Validating first stops us from pushing
  // that user's queued rows (which would fail / leak) and purges the
  // session + local rows instead. Offline → returns cached session and we
  // fall through to best-effort sync as before.
  const {
    data: { session: cached },
  } = await supabase.auth.getSession();
  if (!cached) return;
  const valid = await validateSession();
  if (!valid) {
    await handleInvalidSession();
    return;
  }

  const entries = await dequeueSync();
  if (entries.length === 0) return;

  const db = await getDatabase();
  const syncedTables = new Set<string>();

  for (const entry of entries) {
    try {
      switch (entry.table_name) {
        case "user_profile": {
          if (entry.operation === "upsert") {
            const { error } = await supabase
              .from("user_profile")
              .upsert(
                { id: entry.record_id, ...entry.payload },
                { onConflict: "id", ignoreDuplicates: false },
              );
            if (error) throw error;
          } else if (entry.operation === "update") {
            const { id, ...updates } = entry.payload as {
              id: string;
              [k: string]: unknown;
            };
            const { error } = await supabase
              .from("user_profile")
              .update(updates)
              .eq("id", id);
            if (error) throw error;
          }
          break;
        }
        case "skin_profile": {
          const { id, ...profile } = entry.payload as {
            id: string;
            [k: string]: unknown;
          };
          const { error } = await supabase
            .from("skin_profile")
            .upsert({ id, ...profile });
          if (error) throw error;
          break;
        }
        case "lifestyle_profile": {
          const { id, ...profile } = entry.payload as {
            id: string;
            [k: string]: unknown;
          };
          const { error } = await supabase
            .from("lifestyle_profile")
            .upsert({ id, ...profile });
          if (error) throw error;
          break;
        }
        case "results": {
          const payload = entry.payload as Record<string, unknown>;
          if (
            typeof payload.image_url === "string" &&
            payload.image_url.startsWith("file://")
          ) {
            const cloudUrl = await uploadImageToCloudinary(payload.image_url);
            payload.image_url = cloudUrl ?? null;
          }
          // The server `results` table has no confidence / detection_label /
          // survey_answers columns (verified against the live schema), so
          // they must be excluded or the whole write fails. They are kept
          // on the local row. TODO: add those columns server-side, then stop
          // stripping them here and in insertResult.
          const {
            confidence: _confidence,
            detection_label: _detectionLabel,
            survey_answers: _surveyAnswers,
            id: payloadId,
            ...remotePayload
          } = payload;

          // Never sync rows that don't belong to the signed-in user (e.g.
          // queued while the session was missing and attributed to
          // "anonymous") — RLS would reject them on every retry, forever.
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (
            typeof remotePayload.user_id !== "string" ||
            !session?.user ||
            remotePayload.user_id !== session.user.id
          ) {
            console.warn(
              `[sync] dropping results entry ${entry.id}: queued for user ${String(remotePayload.user_id)}, signed in as ${session?.user?.id ?? "nobody"}`,
            );
            await removeSyncEntry(entry.id);
            continue;
          }

          const tempId =
            typeof payloadId === "number" && payloadId < 0 ? payloadId : null;
          if (tempId !== null) {
            // Row was created offline with a negative temp id. Insert
            // WITHOUT an id so the server generates a real one — reusing
            // the temp id collides with other users' temp rows and trips
            // RLS (42501). Then remap the local row to the server id.
            const { data, error } = await supabase
              .from("results")
              .insert(remotePayload)
              .select("id")
              .single();
            if (error) throw error;
            const ts = new Date().toISOString();
            const alreadyLocal = await db.getFirstAsync<{ id: number }>(
              `SELECT id FROM results WHERE id = ?`,
              [data.id],
            );
            if (alreadyLocal) {
              await db.runAsync(`DELETE FROM results WHERE id = ?`, [tempId]);
            } else {
              await db.runAsync(
                `UPDATE results SET id = ?, synced_at = ? WHERE id = ?`,
                [data.id, ts, tempId],
              );
            }
          } else {
            const { error } = await supabase
              .from("results")
              .upsert({ id: payloadId, ...remotePayload }, { onConflict: "id", ignoreDuplicates: false });
            if (error) throw error;
          }
          break;
        }
        case "routines": {
          const payload = entry.payload as Record<string, unknown>;
          const {
            data: { session: routineSession },
          } = await supabase.auth.getSession();
          if (
            typeof payload.user_id !== "string" ||
            !routineSession?.user ||
            payload.user_id !== routineSession.user.id
          ) {
            console.warn(
              `[sync] dropping routines entry ${entry.id}: queued for user ${String(payload.user_id)}, signed in as ${routineSession?.user?.id ?? "nobody"}`,
            );
            await removeSyncEntry(entry.id);
            continue;
          }
          const { data, error } = await supabase
            .from("routines")
            .upsert(payload, { onConflict: "id", ignoreDuplicates: false })
            .select("id")
            .single();
          if (error) throw error;
          // Remap the offline temp row (and its progress rows) to the id
          // the server generated.
          const tempRoutineId = Number(entry.record_id);
          if (Number.isInteger(tempRoutineId) && tempRoutineId < 0) {
            const ts = new Date().toISOString();
            const alreadyLocal = await db.getFirstAsync<{ id: number }>(
              `SELECT id FROM routines WHERE id = ?`,
              [data.id],
            );
            if (alreadyLocal) {
              await db.runAsync(`DELETE FROM routines WHERE id = ?`, [
                tempRoutineId,
              ]);
            } else {
              await db.runAsync(
                `UPDATE routines SET id = ?, synced_at = ? WHERE id = ?`,
                [data.id, ts, tempRoutineId],
              );
            }
            await db.runAsync(
              `UPDATE routine_progress SET routine_id = ? WHERE routine_id = ?`,
              [data.id, tempRoutineId],
            );
          }
          break;
        }
        case "routine_progress": {
          const payload = entry.payload as {
            user_id: string;
            routine_id: number;
            period: string;
            step: number;
            completed_date: string;
          };
          if (entry.operation === "delete") {
            const { error } = await supabase
              .from("routine_progress")
              .delete()
              .eq("user_id", payload.user_id)
              .eq("routine_id", payload.routine_id)
              .eq("period", payload.period)
              .eq("step", payload.step)
              .eq("completed_date", payload.completed_date);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("routine_progress").upsert(
              {
                user_id: payload.user_id,
                routine_id: payload.routine_id,
                period: payload.period,
                step: payload.step,
                completed_date: payload.completed_date,
              },
              { onConflict: "user_id,routine_id,period,step,completed_date" },
            );
            if (error) throw error;
          }
          break;
        }
        case "sensitivity_history": {
          // Local sqlite autoincrement ids are NOT server ids (the server
          // uses `bigint generated by default as identity`), so the payload
          // id must never be sent or used in onConflict — it would collide
          // with other users' rows. Rows are matched by natural key instead.
          const payload = entry.payload as {
            user_id: string;
            trigger_cause: string;
            occurred_at: string;
            severity?: string;
            notes?: string | null;
            created_at?: string;
          };
          if (entry.operation === "delete") {
            const { data: matches, error: lookupError } = await supabase
              .from("sensitivity_history")
              .select("id")
              .eq("user_id", payload.user_id)
              .eq("occurred_at", payload.occurred_at)
              .eq("trigger_cause", payload.trigger_cause);
            if (lookupError) throw lookupError;
            const ids = (matches ?? []).map((r) => r.id);
            if (ids.length > 0) {
              const { error } = await supabase
                .from("sensitivity_history")
                .delete()
                .in("id", ids);
              if (error) throw error;
            }
            // No match = already gone server-side; still a success so the
            // queue entry is removed below.
          } else {
            const { error } = await supabase
              .from("sensitivity_history")
              .insert({
                user_id: payload.user_id,
                trigger_cause: payload.trigger_cause,
                severity: payload.severity,
                notes: payload.notes ?? null,
                occurred_at: payload.occurred_at,
                created_at: payload.created_at ?? payload.occurred_at,
              });
            if (error) throw error;
          }
          break;
        }
        case "notifications": {
          const payload = entry.payload as {
            id: string;
            user_id: string;
            type: string;
            title: string;
            message: string;
            read: boolean;
            created_at: string;
          };
          if (entry.operation === "delete") {
            if (payload.id) {
              const { error } = await supabase
                .from("notifications")
                .delete()
                .eq("id", payload.id);
              if (error) throw error;
            } else {
              const { error } = await supabase
                .from("notifications")
                .delete()
                .eq("user_id", payload.user_id);
              if (error) throw error;
            }
          } else if (entry.operation === "update") {
            const { error } = await supabase
              .from("notifications")
              .update({ read: payload.read })
              .eq("id", payload.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("notifications")
              .upsert(
                {
                  id: payload.id,
                  user_id: payload.user_id,
                  type: payload.type,
                  title: payload.title,
                  message: payload.message,
                  read: payload.read,
                  created_at: payload.created_at,
                },
                { onConflict: "id", ignoreDuplicates: false },
              );
            if (error) throw error;
          }
          break;
        }
        default: {
          // Unknown table — this entry can never sync. Drop it so it isn't
          // reprocessed on every pass, but don't mark anything as synced
          // (that would run UPDATE against an arbitrary table name below).
          await removeSyncEntry(entry.id);
          continue;
        }
      }
      syncedTables.add(entry.table_name);
      await removeSyncEntry(entry.id);
    } catch (err) {
      if (isAuthSyncError(err)) {
        // The account this queue belongs to is gone (deleted in the
        // dashboard, token revoked, …). Retrying forever would spin on
        // every reconnect — purge the session + local rows and stop.
        console.warn(
          `[sync] auth rejected ${entry.table_name} entry ${entry.id}, purging session`,
        );
        await handleInvalidSession();
        return;
      }
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : null;
      if (code === "42501") {
        // Row-level security rejected this payload and will reject it on
        // every retry (e.g. queued under a different user). Drop it so the
        // queue can drain — the local copy is retained on-device.
        console.warn(
          `[sync] dropping ${entry.table_name} entry ${entry.id}: rejected by RLS policy`,
        );
        await removeSyncEntry(entry.id);
        continue;
      }
      console.error(`Sync failed for ${entry.table_name} entry ${entry.id}:`, err);
      continue;
    }
  }

  if (syncedTables.size === 0) return;

  const ts = new Date().toISOString();
  for (const table of syncedTables) {
    await db.runAsync(`UPDATE ${table} SET synced_at = ?`, [ts]);
  }
}
