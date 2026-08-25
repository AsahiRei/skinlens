import { supabase } from "@/utils/supabase";
import { requireUser } from "./auth";
import { getTodayStr } from "@/utils/date";
import type { Routine, Period } from "@/types/schema";

export async function getLatestRoutine(): Promise<{
  id: number;
  routine: Routine;
} | null> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("routines")
    .select("id, routine_json")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.routine_json) return null;
  return { id: data.id, routine: JSON.parse(data.routine_json) };
}

export async function insertRoutine(routineJson: string): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase.from("routines").insert({
    user_id: user.id,
    source_type: "ai_generated",
    routine_json: routineJson,
  });
  if (error) throw error;
}

export async function getTodayProgress(
  routineId: number,
): Promise<Set<string>> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("routine_progress")
    .select("period, step")
    .eq("user_id", user.id)
    .eq("routine_id", routineId)
    .eq("completed_date", getTodayStr());
  if (error) throw error;
  return new Set((data ?? []).map((r) => `${r.period}-${r.step}`));
}

export async function toggleStep(
  routineId: number,
  period: Period,
  step: number,
  isCurrentlyDone: boolean,
): Promise<void> {
  const user = await requireUser();
  const todayStr = getTodayStr();

  if (isCurrentlyDone) {
    const { error } = await supabase
      .from("routine_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("routine_id", routineId)
      .eq("period", period)
      .eq("step", step)
      .eq("completed_date", todayStr);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("routine_progress").upsert(
      {
        user_id: user.id,
        routine_id: routineId,
        period,
        step,
        completed_date: todayStr,
      },
      { onConflict: "user_id,routine_id,period,step,completed_date" },
    );
    if (error) throw error;
  }
}
