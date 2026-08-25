import { supabase } from "@/utils/supabase";
import { requireUser } from "./auth";
import type { Result, ResultData, RecommendedProduct } from "@/types/schema";

export async function getLatestResult(): Promise<Result | null> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLatestResultDetail(): Promise<ResultData | null> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("results")
    .select("severity, description, healthscore, recommendations")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLatestHealthscore(): Promise<number | null> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("results")
    .select("healthscore")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.healthscore ?? null;
}

export async function insertResult(result: {
  severity: string;
  description: string;
  healthscore: number;
  recommendations: RecommendedProduct[] | null;
}): Promise<Result> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("results")
    .insert({
      user_id: user.id,
      severity: result.severity,
      description: result.description,
      healthscore: result.healthscore,
      source_type: "ai_generated",
      recommendations: result.recommendations,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
