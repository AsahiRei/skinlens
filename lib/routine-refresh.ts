import {
  addSensitivityEntry,
  getHealthProfile,
  getLatestResult,
  getLifestyleProfile,
  getSensitivityHistory,
  getSkinProfile,
  insertRoutine,
} from "@/lib/db";
import type { HealthProfile, LifestyleProfile, SkinProfile } from "@/types/schema";
import { ingredientsAvoidedBySensitivity } from "@/utils/knowledge";
import { isDisputedResult, isPhotoBasedResult } from "@/utils/result-kind";
import { type GenerateRoutineInput, generateRoutine } from "@/utils/routine-generator";

export type RoutineContext = {
  skin: SkinProfile | null;
  lifestyle: LifestyleProfile | null;
  health: HealthProfile | null;
  avoidIngredients: string[];
};

/**
 * Everything personal a routine must respect: profiles, the sensitivity log (as ingredient names)
 * and the health profile's safety context. One loader for setup, scans and rebuilds, so no screen
 * can forget the triggers. Sequential reads: the app shares one SQLite handle (expo#48995).
 */
export async function loadRoutineContext(): Promise<RoutineContext> {
  const skin = await getSkinProfile().catch(() => null);
  const lifestyle = await getLifestyleProfile().catch(() => null);
  const health = await getHealthProfile().catch(() => null);
  const sensitivity = await getSensitivityHistory().catch(() => []);
  return {
    skin,
    lifestyle,
    health,
    avoidIngredients: ingredientsAvoidedBySensitivity(sensitivity),
  };
}

export function routineInput(
  ctx: RoutineContext,
  overrides: { main_concern: string; health_score: number; skin_type?: string },
): GenerateRoutineInput {
  return {
    skin_type: overrides.skin_type ?? ctx.skin?.skin_type ?? "normal",
    main_concern: overrides.main_concern,
    sleep_quality: ctx.lifestyle?.sleep_quality ?? "fair",
    stress_level: ctx.lifestyle?.stress_level ?? "moderate",
    water_intake: ctx.lifestyle?.water_intake ?? "1_to_1_5l",
    health_score: overrides.health_score,
    profile_concerns: ctx.skin?.main_concerns ?? null,
    avoid_ingredients: ctx.avoidIngredients,
    pregnancy_status: ctx.health?.pregnancy_status ?? null,
    current_treatment: ctx.health?.current_treatment ?? null,
  };
}

/**
 * Rebuilds the routine right after something that changes what's safe to recommend (a logged
 * reaction, an edited health profile) instead of waiting for the next scan. The concern comes
 * from the latest photo-graded, undisputed scan, else from the user's stated main concern.
 */
export async function refreshRoutineFromProfile(): Promise<void> {
  const ctx = await loadRoutineContext();
  const latest = await getLatestResult().catch(() => null);
  const useScan = latest && isPhotoBasedResult(latest) && !isDisputedResult(latest);
  const concern = (useScan ? latest?.detection_label : null) || ctx.skin?.main_concerns || "normal";
  const score = latest ? Math.round(latest.healthscore) : 50;
  const routineJson = await generateRoutine(
    routineInput(ctx, { main_concern: concern, health_score: score }),
  );
  await insertRoutine(routineJson);
}

/**
 * One-tap "this irritated me" from a recommendation card: logs a structured sensitivity entry
 * naming the ingredients (so matching never depends on free-text wording) and rebuilds the routine
 * without them.
 */
export async function reportReaction(input: {
  ingredients: string[];
  productLabel?: string | null;
  severity?: "mild" | "moderate" | "severe";
}): Promise<void> {
  const parts = [
    input.productLabel ? `Product: ${input.productLabel}.` : "",
    input.ingredients.length > 0 ? `Ingredients: ${input.ingredients.join(", ")}.` : "",
  ].filter(Boolean);
  await addSensitivityEntry({
    trigger_cause: "product",
    severity: input.severity ?? "mild",
    notes: parts.join(" "),
  });
  await refreshRoutineFromProfile();
}
