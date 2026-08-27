import { supabase } from "@/utils/supabase";

import { getDatabase } from "./database";
import { dequeueSync, removeSyncEntry } from "./sync-queue";

export async function processSyncQueue(): Promise<void> {
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
          const { error } = await supabase
            .from("results")
            .insert(entry.payload);
          if (error) throw error;
          break;
        }
        case "routines": {
          const { error } = await supabase
            .from("routines")
            .insert(entry.payload);
          if (error) throw error;
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
      }
      syncedTables.add(entry.table_name);
      await removeSyncEntry(entry.id);
    } catch {
      break;
    }
  }

  if (syncedTables.size === 0) return;

  const ts = new Date().toISOString();
  for (const table of syncedTables) {
    await db.runAsync(`UPDATE ${table} SET synced_at = ?`, [ts]);
  }
}
