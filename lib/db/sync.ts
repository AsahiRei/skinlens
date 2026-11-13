import * as FileSystem from "expo-file-system/legacy";

import { isOnlineNow } from "@/utils/network";
import { supabase, validateSession } from "@/utils/supabase";
import { uploadImageToCloudinary } from "@/utils/cloudinary";

import { handleInvalidSession } from "./auth";
import { getDatabase } from "./database";
import { isMissingColumnError, isTransportSyncError } from "./pg-errors";
import { claimAnonymousResults } from "./results";
import { dequeueSync, rememberRoutineRemap, removeSyncEntry, resolveRoutineId } from "./sync-queue";

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
  // Supabase auth errors: invalid JWT / user gone. Schema errors (42703, "relation does not exist")
  // must NEVER match here — handleInvalidSession wipes every local table on a match.
  if (code === "PGRST301") return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err ?? "").toLowerCase();
  return (
    msg.includes("jwt") ||
    msg.includes("user_not_found") ||
    msg.includes("user from sub claim") ||
    msg.includes("not authenticated") ||
    msg.includes("invalid token") ||
    msg.includes("token revoked") ||
    msg.includes("refresh token")
  );
}

export function processSyncQueue(opts?: {
  // Set by callers that just ran validateSession() themselves: skips the second (identical) network
  // round trip.
  sessionValidated?: boolean;
}): Promise<void> {
  // SyncManager (mount) and network transitions can trigger this concurrently; two parallel passes
  // would pick up and double-apply the same queue rows. A call that arrives mid-pass must still WAIT
  // for the queue to drain (logout counts what's left right after), and the running pass works on a
  // snapshot taken before the call, so chain exactly one follow-up pass for all such callers.
  if (current) {
    if (!next) {
      next = current
        .catch(() => {})
        .then(() => {
          next = null;
          return processSyncQueue(opts);
        });
    }
    return next;
  }
  current = processSyncQueueInner(opts?.sessionValidated === true).finally(() => {
    current = null;
  });
  return current;
}

let current: Promise<void> | null = null;
let next: Promise<void> | null = null;

/** Points queued routine_progress writes made against an offline temp routine at its server id. */
async function remapQueuedRoutineProgress(
  db: Awaited<ReturnType<typeof getDatabase>>,
  tempId: number,
  realId: number,
): Promise<void> {
  const rows = await db.getAllAsync<{ id: number; payload: string }>(
    `SELECT id, payload FROM sync_queue WHERE table_name = 'routine_progress'`,
  );
  for (const row of rows) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      continue;
    }
    if (payload.routine_id !== tempId) continue;
    await db.runAsync(`UPDATE sync_queue SET payload = ? WHERE id = ?`, [
      JSON.stringify({ ...payload, routine_id: realId }),
      row.id,
    ]);
  }
}

async function processSyncQueueInner(sessionValidated = false): Promise<void> {
  // Deleted-user guard: the cached AsyncStorage session may belong to an account that no longer
  // exists. Validating first stops us from pushing that user's queued rows (which would fail /
  // leak) and purges the session + local rows instead.
  const {
    data: { session: cached },
  } = await supabase.auth.getSession();
  if (!cached) return;
  if (!sessionValidated) {
    const valid = await validateSession();
    if (!valid) {
      await handleInvalidSession();
      return;
    }
  }

  // Scans taken while signed out sit under user_id='anonymous' and would be invisible to every read
  // (which filters on the real id).
  try {
    await claimAnonymousResults();
  } catch (err) {
    console.warn("[sync] claimAnonymousResults failed:", err);
  }

  const entries = await dequeueSync();
  if (entries.length === 0) return;

  const db = await getDatabase();
  const syncedTables = new Set<string>();
  // Read once per pass instead of once per results/routines entry (each
  // getSession() takes the supabase-js auth lock + an AsyncStorage read).
  const sessionUserId: string | null = cached.user?.id ?? null;

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
            // `.select()` matters: PostgREST reports NO error when an UPDATE matches zero rows
            // (profile row never created server-side), which would drop the fields silently.
            const { data: updated, error } = await supabase
              .from("user_profile")
              .update(updates)
              .eq("id", id)
              .select("id");
            if (error) throw error;
            if (!updated || updated.length === 0) {
              const { error: upsertError } = await supabase
                .from("user_profile")
                .upsert({ id, ...updates }, { onConflict: "id" });
              if (upsertError) throw upsertError;
            }
          }
          break;
        }
        case "skin_profile": {
          const { id, ...profile } = entry.payload as {
            id: string;
            [k: string]: unknown;
          };
          const { error } = await supabase.from("skin_profile").upsert({ id, ...profile });
          if (error) throw error;
          break;
        }
        case "lifestyle_profile": {
          const { id, ...profile } = entry.payload as {
            id: string;
            [k: string]: unknown;
          };
          const { error } = await supabase.from("lifestyle_profile").upsert({ id, ...profile });
          if (error) throw error;
          break;
        }
        case "health_profile": {
          const { id, ...profile } = entry.payload as {
            id: string;
            [k: string]: unknown;
          };
          const { error } = await supabase
            .from("health_profile")
            .upsert({ id, ...profile, updated_at: new Date().toISOString() });
          if (error) throw error;
          break;
        }
        case "results": {
          const payload = entry.payload as Record<string, unknown>;
          // A device-path image must be uploaded before it means anything server-side. If the
          // upload fails, the row is still pushed (without touching image_url) but the entry stays
          // queued so the photo is retried — pushing null used to lose it for good, and logout then
          // wiped the only local copy.
          let deferImage = false;
          let uploadedImage: string | null = null;
          if (typeof payload.image_url === "string" && !/^https?:\/\//i.test(payload.image_url)) {
            const localUri = payload.image_url;
            const exists = localUri.startsWith("file://")
              ? await FileSystem.getInfoAsync(localUri)
                  .then((i) => i.exists)
                  .catch(() => false)
              : true;
            if (!exists) {
              // File is gone (cache cleared) — nothing left to upload.
              payload.image_url = null;
            } else {
              // One retry only: a failed photo stays queued for the next pass anyway, and long
              // backoffs here hold up every entry behind it.
              const cloudUrl = await uploadImageToCloudinary(localUri, 1);
              if (cloudUrl) {
                payload.image_url = cloudUrl;
                uploadedImage = cloudUrl;
              } else if (!(await isOnlineNow())) {
                // Connection dropped: every remaining entry would fail too. Throwing (not `break`,
                // which would only leave the switch and dequeue this entry) routes into the
                // transport-error handler below, which keeps the entry and pauses the pass.
                throw new Error("Network request failed (offline during image upload)");
              } else {
                deferImage = true;
              }
            }
          }
          // Validation columns are owned by the validate_ai_result() RPC (migration 0007) — strip
          // them defensively so a patient sync can never overwrite a dermatologist's review.
          const {
            id: payloadId,
            validation_status: _validationStatus,
            doctor_notes: _doctorNotes,
            validated_by: _validatedBy,
            validated_at: _validatedAt,
            ...remotePayload
          } = payload;

          // Never sync rows that don't belong to the signed-in user (e.g.
          // queued while the session was missing and attributed to
          // "anonymous") — RLS would reject them on every retry, forever.
          if (
            typeof remotePayload.user_id !== "string" ||
            !sessionUserId ||
            remotePayload.user_id !== sessionUserId
          ) {
            console.warn(
              `[sync] dropping results entry ${entry.id}: queued for user ${String(remotePayload.user_id)}, signed in as ${sessionUserId ?? "nobody"}`,
            );
            await removeSyncEntry(entry.id);
            continue;
          }

          const tempId = typeof payloadId === "number" && payloadId < 0 ? payloadId : null;

          const writeResultsRow = async (body: Record<string, unknown>): Promise<number | null> => {
            if (tempId !== null) {
              // Row was created offline with a negative temp id. Insert WITHOUT an id so the server
              // generates a real one — reusing the temp id collides with other users' temp rows and
              // trips RLS (42501).
              const { data, error } = await supabase
                .from("results")
                .insert(body)
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
                await db.runAsync(`UPDATE results SET id = ?, synced_at = ? WHERE id = ?`, [
                  data.id,
                  ts,
                  tempId,
                ]);
              }
              return typeof data.id === "number" ? data.id : null;
            } else {
              const { error } = await supabase
                .from("results")
                .upsert({ id: payloadId, ...body }, { onConflict: "id", ignoreDuplicates: false });
              if (error) throw error;
              return null;
            }
          };

          let body: Record<string, unknown> = remotePayload;
          if (deferImage) {
            const { image_url: _pendingImage, ...rest } = body;
            body = rest;
          }
          let keepQueued = deferImage;
          let serverId: number | null;
          try {
            serverId = await writeResultsRow(body);
          } catch (err) {
            if (!isMissingColumnError(err)) throw err;
            // Server predates migration 0007: push the core row now, keep
            // this entry queued so confidence / detection_label /
            // survey_answers flow up on the next pass after 0007 is applied.
            console.warn(
              `[sync] results entry ${entry.id}: server missing scan columns (apply supabase/migrations/0007_result_validation.sql), core row synced; scan fields stay queued`,
            );
            const {
              confidence: _confidence,
              detection_label: _detectionLabel,
              survey_answers: _surveyAnswers,
              ...corePayload
            } = body;
            serverId = await writeResultsRow(corePayload);
            keepQueued = true;
          }

          const rowId = serverId ?? (typeof payloadId === "number" ? payloadId : null);
          if (uploadedImage && rowId !== null) {
            // Point the local cache at the cloud copy too, so it survives the device file going away.
            await db.runAsync(`UPDATE results SET image_url = ? WHERE id = ?`, [
              uploadedImage,
              rowId,
            ]);
          }

          if (keepQueued) {
            if (deferImage) {
              console.warn(
                `[sync] results entry ${entry.id}: image upload failed, row synced; image stays queued`,
              );
            }
            // Re-point the still-queued payload at the real id (a temp id was consumed by the insert
            // above, local row remapped) so the next pass upserts INTO that row instead of inserting
            // a duplicate, and carry over an already-uploaded URL so it isn't uploaded twice.
            if (rowId !== null) {
              await db.runAsync(`UPDATE sync_queue SET record_id = ?, payload = ? WHERE id = ?`, [
                String(rowId),
                JSON.stringify({ ...payload, id: rowId }),
                entry.id,
              ]);
            }
            continue;
          }
          break;
        }
        case "routines": {
          const payload = entry.payload as Record<string, unknown>;
          if (
            typeof payload.user_id !== "string" ||
            !sessionUserId ||
            payload.user_id !== sessionUserId
          ) {
            console.warn(
              `[sync] dropping routines entry ${entry.id}: queued for user ${String(payload.user_id)}, signed in as ${sessionUserId ?? "nobody"}`,
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
              await db.runAsync(`DELETE FROM routines WHERE id = ?`, [tempRoutineId]);
            } else {
              await db.runAsync(`UPDATE routines SET id = ?, synced_at = ? WHERE id = ?`, [
                data.id,
                ts,
                tempRoutineId,
              ]);
            }
            await db.runAsync(`UPDATE routine_progress SET routine_id = ? WHERE routine_id = ?`, [
              data.id,
              tempRoutineId,
            ]);
            // Progress toggled while offline was queued with the temp id; without this it is sent
            // with a routine id that doesn't exist server-side and fails on every pass, forever.
            await remapQueuedRoutineProgress(db, tempRoutineId, data.id);
            rememberRoutineRemap(tempRoutineId, data.id);
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
          if (payload.routine_id < 0) {
            const realId = resolveRoutineId(payload.routine_id);
            if (realId >= 0) {
              // Toggled from a screen still holding the temp id after the routine synced.
              await db.runAsync(`UPDATE routine_progress SET routine_id = ? WHERE routine_id = ?`, [
                realId,
                payload.routine_id,
              ]);
              payload.routine_id = realId;
            } else {
              const routinePending = await db.getFirstAsync<{ id: number }>(
                `SELECT id FROM sync_queue WHERE table_name = 'routines' AND record_id = ? LIMIT 1`,
                [String(payload.routine_id)],
              );
              if (routinePending) {
                // The routine itself hasn't reached the server yet — keep this queued for later.
                continue;
              }
              console.warn(
                `[sync] dropping routine_progress entry ${entry.id}: routine ${payload.routine_id} never synced`,
              );
              await removeSyncEntry(entry.id);
              continue;
            }
          }
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
          // Local sqlite autoincrement ids are NOT server ids (the server uses `bigint generated by
          // default as identity`), so the payload id must never be sent or used in onConflict — it
          // would collide with other users' rows.
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
              const { error } = await supabase.from("sensitivity_history").delete().in("id", ids);
              if (error) throw error;
            }
            // No match = already gone server-side; still a success so the
            // queue entry is removed below.
          } else {
            // Upsert by natural key, exactly like the delete branch: local sqlite ids are not
            // server ids, and a bare insert would create a second server row whenever this entry is
            // replayed (the inline write in addSensitivityEntry succeeds but used to leave the
            // queued copy behind).
            const { data: matches, error: lookupError } = await supabase
              .from("sensitivity_history")
              .select("id")
              .eq("user_id", payload.user_id)
              .eq("occurred_at", payload.occurred_at)
              .eq("trigger_cause", payload.trigger_cause);
            if (lookupError) throw lookupError;
            const row = {
              user_id: payload.user_id,
              trigger_cause: payload.trigger_cause,
              severity: payload.severity,
              notes: payload.notes ?? null,
              occurred_at: payload.occurred_at,
              created_at: payload.created_at ?? payload.occurred_at,
            };
            const existing = matches ?? [];
            if (existing.length > 0) {
              const { error } = await supabase
                .from("sensitivity_history")
                .update(row)
                .eq("id", existing[0].id);
              if (error) throw error;
            } else {
              const { error } = await supabase.from("sensitivity_history").insert(row);
              if (error) throw error;
            }
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
              const { error } = await supabase.from("notifications").delete().eq("id", payload.id);
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
            const { error } = await supabase.from("notifications").upsert(
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
          // Unknown table — this entry can never sync.
          await removeSyncEntry(entry.id);
          continue;
        }
      }
      syncedTables.add(entry.table_name);
      await removeSyncEntry(entry.id);
    } catch (err) {
      if (isAuthSyncError(err)) {
        // The account this queue belongs to is gone (deleted in the dashboard, token revoked, …).
        // Retrying forever would spin on every reconnect — purge the session + local rows and stop.
        console.warn(`[sync] auth rejected ${entry.table_name} entry ${entry.id}, purging session`);
        await handleInvalidSession();
        return;
      }
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : null;
      if (code === "42501") {
        // Row-level security rejected this payload and will reject it on every retry (e.g. queued
        // under a different user).
        console.warn(
          `[sync] dropping ${entry.table_name} entry ${entry.id}: rejected by RLS policy`,
        );
        await removeSyncEntry(entry.id);
        continue;
      }
      if (isTransportSyncError(err)) {
        // Connection dropped (or never really came back) mid-pass.
        console.warn(
          `[sync] network error on ${entry.table_name} entry ${entry.id}, pausing sync until next reconnect`,
        );
        break;
      }
      console.error(`Sync failed for ${entry.table_name} entry ${entry.id}:`, err);
      continue;
    }
  }

  if (syncedTables.size === 0) return;

  // Only stamp rows that have never been stamped: rewriting every row of
  // every touched table on each pass grew the WAL with the table size and
  // blocked the serialized DB queue that the UI reads go through.
  const ts = new Date().toISOString();
  for (const table of syncedTables) {
    await db.runAsync(`UPDATE ${table} SET synced_at = ? WHERE synced_at IS NULL`, [ts]);
  }
}
