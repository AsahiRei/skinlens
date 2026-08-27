<<<<<<< HEAD
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
  }>(`SELECT * FROM results WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [
    user.id,
  ]);

  if (local) {
    // Background refresh
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
          await db.runAsync(
            `INSERT OR REPLACE INTO results (id, user_id, severity, description, healthscore, image_url, source_type, recommendations, created_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              data.id,
              data.user_id,
              data.severity,
              data.description,
              data.healthscore,
              data.image_url ?? null,
              data.source_type,
              data.recommendations
                ? JSON.stringify(data.recommendations)
                : null,
              data.created_at,
              now(),
            ],
          );
        }
      })(),
    );
    return {
      id: local.id,
      severity: local.severity,
      description: local.description,
      healthscore: local.healthscore,
      image_url: local.image_url,
      source_type: local.source_type,
      recommendations: local.recommendations
        ? JSON.parse(local.recommendations)
        : null,
      user_id: local.user_id,
      created_at: local.created_at,
    };
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

    await db.runAsync(
      `INSERT OR REPLACE INTO results (id, user_id, severity, description, healthscore, image_url, source_type, recommendations, created_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
      ],
    );
    return data;
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

export async function getLatestHealthscore(): Promise<number | null> {
  const result = await getLatestResult();
  return result?.healthscore ?? null;
=======
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
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
}

export async function insertResult(result: {
  severity: string;
  description: string;
  healthscore: number;
  recommendations: RecommendedProduct[] | null;
<<<<<<< HEAD
  image_url?: string | null;
  source_type?: string;
}): Promise<Result> {
  const user = await requireUser();
  const db = await getDatabase();
  const sourceType = result.source_type ?? "ai_generated";

  let serverResult: Result;
  try {
    const { data, error } = await supabase
      .from("results")
      .insert({
        user_id: user.id,
        severity: result.severity,
        description: result.description,
        healthscore: result.healthscore,
        image_url: result.image_url ?? null,
        source_type: sourceType,
        recommendations: result.recommendations,
      })
      .select()
      .single();
    if (error) throw error;
    serverResult = data;
  } catch {
    // Offline — store locally with temp id
    const maxRow = await db.getFirstAsync<{ max_id: number | null }>(
      `SELECT MAX(id) as max_id FROM results WHERE user_id = ?`,
      [user.id],
    );
    const tempId = Math.min(maxRow?.max_id ?? 0, 0) - 1;
    serverResult = {
      id: tempId,
=======
}): Promise<Result> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("results")
    .insert({
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
      user_id: user.id,
      severity: result.severity,
      description: result.description,
      healthscore: result.healthscore,
<<<<<<< HEAD
      image_url: result.image_url ?? null,
      source_type: sourceType,
      recommendations: result.recommendations,
      created_at: now(),
    };
    await enqueueSync("results", "insert", String(tempId), {
      user_id: user.id,
      severity: result.severity,
      description: result.description,
      healthscore: result.healthscore,
      image_url: result.image_url ?? null,
      source_type: sourceType,
      recommendations: result.recommendations,
    });
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO results (id, user_id, severity, description, healthscore, image_url, source_type, recommendations, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      serverResult.id,
      serverResult.user_id,
      serverResult.severity,
      serverResult.description,
      serverResult.healthscore,
      serverResult.image_url ?? null,
      serverResult.source_type,
      serverResult.recommendations
        ? JSON.stringify(serverResult.recommendations)
        : null,
      serverResult.created_at,
      now(),
    ],
  );
  return serverResult;
=======
      source_type: "ai_generated",
      recommendations: result.recommendations,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
}
