import { useEffect, useState } from "react";

import { getDatabase } from "@/lib/db/database";
import { requireUser } from "@/lib/db/auth";
import type { ChatUserContext } from "@/types/chat";

function summarizeRoutine(routineJson: string | null): string | null {
  if (!routineJson) return null;
  try {
    const routine = JSON.parse(routineJson);
    const parts: string[] = [];
    const formatPeriod = (label: string, steps: { product_type?: string }[] | undefined) => {
      if (!steps || steps.length === 0) return;
      const names = steps
        .map((s) => s?.product_type)
        .filter((n): n is string => !!n);
      parts.push(`${label}: ${names.length > 0 ? names.join(", ") : `${steps.length} steps`}`);
    };
    formatPeriod("Morning", routine.morning_routine);
    formatPeriod("Afternoon", routine.afternoon_routine);
    formatPeriod("Evening", routine.evening_routine);
    const total =
      (routine.morning_routine?.length ?? 0) +
      (routine.afternoon_routine?.length ?? 0) +
      (routine.evening_routine?.length ?? 0);
    const header = total > 0 ? `${total} steps` : "Routine on file";
    const summary = routine.summary ? ` ${routine.summary}` : "";
    const detail = parts.length > 0 ? ` (${parts.join("; ")})` : "";
    return `${header}.${summary}${detail}`.trim();
  } catch {
    return null;
  }
}

function summarizeRecommendations(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const recs = JSON.parse(raw);
    if (!Array.isArray(recs) || recs.length === 0) return null;
    return recs
      .slice(0, 6)
      .map((r: { product_type?: string; recommended_ingredients?: string[] }) => {
        const ingredients = r.recommended_ingredients?.length
          ? ` (${r.recommended_ingredients.slice(0, 3).join(", ")})`
          : "";
        return `${r.product_type ?? "product"}${ingredients}`;
      })
      .join("; ");
  } catch {
    // Stored as plain text rather than JSON — use as-is (truncated).
    return raw.slice(0, 300);
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
            db.getFirstAsync<{ first_name: string; age: string; gender: string }>(
              `SELECT first_name, age, gender FROM user_profile WHERE id = ?`,
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
            db.getFirstAsync<{
              healthscore: number;
              severity: string;
              description: string;
              detection_label: string;
              recommendations: string;
            }>(
              `SELECT healthscore, severity, description, detection_label, recommendations FROM results WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
              [user.id],
            ),
          ]);

        if (!isMounted) return;
        setUserContext({
          first_name: userRow?.first_name,
          age: userRow?.age,
          gender: userRow?.gender,
          skin_type: skinRow?.skin_type,
          main_concerns: skinRow?.main_concerns,
          healthscore: resultRow?.healthscore,
          last_diagnosis: resultRow?.description,
          detection_label: resultRow?.detection_label,
          severity: resultRow?.severity,
          sleep_quality: lifestyleRow?.sleep_quality,
          water_intake: lifestyleRow?.water_intake,
          stress_level: lifestyleRow?.stress_level,
          routine_summary: summarizeRoutine(routineRow?.routine_json ?? null),
          recommendations_summary: summarizeRecommendations(
            resultRow?.recommendations ?? null,
          ),
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
