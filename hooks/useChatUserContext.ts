import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { requireUser } from "@/lib/db";
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
