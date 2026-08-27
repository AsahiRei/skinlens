import { useEffect, useState } from "react";
<<<<<<< HEAD

import { getDatabase } from "@/lib/db/database";
import { requireUser } from "@/lib/db/auth";
=======
import { supabase } from "@/utils/supabase";
import { requireUser } from "@/lib/db";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
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
<<<<<<< HEAD
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
=======
        const [
          { data: userProfile },
          { data: skinProfile },
          { data: lifestyleProfile },
          { data: latestRoutine },
          { data: latestResult },
        ] = await Promise.all([
          supabase.from("user_profile").select("username").eq("id", user.id).single(),
          supabase
            .from("skin_profile")
            .select("skin_type, main_concerns")
            .eq("id", user.id)
            .single(),
          supabase
            .from("lifestyle_profile")
            .select("sleep_quality, water_intake, stress_level")
            .eq("id", user.id)
            .single(),
          supabase
            .from("routines")
            .select("routine_json")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("results")
            .select("healthscore")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (!isMounted) return;
        setUserContext({
          username: userProfile?.username,
          skin_type: skinProfile?.skin_type,
          main_concerns: skinProfile?.main_concerns,
          healthscore: latestResult?.healthscore,
          sleep_quality: lifestyleProfile?.sleep_quality,
          water_intake: lifestyleProfile?.water_intake,
          stress_level: lifestyleProfile?.stress_level,
          routine_summary: summarizeRoutine(latestRoutine?.routine_json ?? null),
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
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
