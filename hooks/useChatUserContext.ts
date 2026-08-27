import { useEffect, useState } from "react";

import { getDatabase } from "@/lib/db/database";
import { requireUser } from "@/lib/db/auth";
import type { ChatUserContext } from "@/types/chat";

function summarizeRoutine(routineJson: string | null): string | null {
  if (!routineJson) return null;
  try {
    const routine = JSON.parse(routineJson);
    const total =
      (routine.morning_routine?.length ?? 0) +
      (routine.afternoon_routine?.length ?? 0) +
      (routine.evening_routine?.length ?? 0);
    return `${total} steps across morning/afternoon/evening. ${routine.summary ?? ""}`.trim();
  } catch {
    return null;
  }
}

export function useChatUserContext() {
  const [userContext, setUserContext] = useState<ChatUserContext | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const user = await requireUser();
        const db = await getDatabase();

        const [userRow, skinRow, lifestyleRow, routineRow, resultRow] =
          await Promise.all([
            db.getFirstAsync<{ username: string }>(
              `SELECT username FROM user_profile WHERE id = ?`,
              [user.id],
            ),
            db.getFirstAsync<{ skin_type: string; main_concerns: string }>(
              `SELECT skin_type, main_concerns FROM skin_profile WHERE id = ?`,
              [user.id],
            ),
            db.getFirstAsync<{
              sleep_quality: string;
              water_intake: string;
              stress_level: string;
            }>(
              `SELECT sleep_quality, water_intake, stress_level FROM lifestyle_profile WHERE id = ?`,
              [user.id],
            ),
            db.getFirstAsync<{ routine_json: string }>(
              `SELECT routine_json FROM routines WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
              [user.id],
            ),
            db.getFirstAsync<{ healthscore: number }>(
              `SELECT healthscore FROM results WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
              [user.id],
            ),
          ]);

        if (!isMounted) return;
        setUserContext({
          username: userRow?.username,
          skin_type: skinRow?.skin_type,
          main_concerns: skinRow?.main_concerns,
          healthscore: resultRow?.healthscore,
          sleep_quality: lifestyleRow?.sleep_quality,
          water_intake: lifestyleRow?.water_intake,
          stress_level: lifestyleRow?.stress_level,
          routine_summary: summarizeRoutine(routineRow?.routine_json ?? null),
        });
      } catch (err) {
        console.error("Error building chat user context:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);
  return { userContext, loading };
}
