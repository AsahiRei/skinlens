import { getIngredientsForCondition, getProductsForCondition } from "./knowledge";

function parseAndValidateRoutine(jsonStr: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      "Failed to parse routine JSON: " + jsonStr.slice(0, 200),
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Routine JSON is not an object");
  }

  if (typeof parsed.summary !== "string") {
    parsed.summary = "Your personalized skincare routine.";
  }

  const routineKeys = [
    "morning_routine",
    "afternoon_routine",
    "evening_routine",
  ] as const;

  for (const key of routineKeys) {
    if (!Array.isArray(parsed[key])) {
      parsed[key] = [];
    }
    for (let i = 0; i < parsed[key].length; i++) {
      const step = parsed[key][i];
      if (typeof step === "string") {
        parsed[key][i] = {
          step: i + 1,
          product_type: step.split(":")[0]?.trim() || "Skincare Product",
          instruction: step,
          reason: "Part of your personalized routine.",
        };
      } else if (typeof step === "object" && step !== null) {
        if (typeof step.step !== "number") step.step = i + 1;
        if (typeof step.product_type !== "string")
          step.product_type = "Skincare Product";
        if (typeof step.instruction !== "string") step.instruction = "";
        if (typeof step.reason !== "string") step.reason = "";
      }
    }
  }

  if (!Array.isArray(parsed.recommended_products)) {
    parsed.recommended_products = [];
  }
  for (let i = 0; i < parsed.recommended_products.length; i++) {
    const prod = parsed.recommended_products[i];
    if (typeof prod === "string") {
      parsed.recommended_products[i] = {
        product_type: prod,
        recommended_ingredients: [],
        reason: "",
      };
    } else if (typeof prod === "object" && prod !== null) {
      if (typeof prod.product_type !== "string")
        prod.product_type = "Skincare Product";
      if (!Array.isArray(prod.recommended_ingredients))
        prod.recommended_ingredients = [];
      if (typeof prod.reason !== "string") prod.reason = "";
    }
  }

  return JSON.stringify(parsed);
}

/** Short benefit phrase per ingredient for natural fallback reasons. */
const INGREDIENT_ACTION: Record<string, string> = {
  "Salicylic Acid": "unclogs pores and clears blackheads",
  "Benzoyl Peroxide": "kills breakout-causing bacteria",
  Niacinamide: "calms redness and balances oil",
  Retinol: "smooths texture and prevents clogged pores",
  "Tea Tree Oil": "fights blemish-causing bacteria",
  Ceramides: "rebuilds the moisture barrier",
  "Hyaluronic Acid": "draws in deep, lasting hydration",
  "Colloidal Oatmeal": "soothes itching and irritation",
  Squalane: "softens skin without irritation",
  "Shea Butter": "deeply nourishes and softens skin",
  Glycerin: "locks moisture into the skin",
  "Zinc Oxide": "shields skin with mineral UV protection",
  "Green Tea Extract": "calms inflammation and excess oil",
  "Clay (Kaolin/Bentonite)": "absorbs excess oil and impurities",
  "Vitamin C": "brightens skin and defends against damage",
  "Glycolic Acid": "gently refines texture and tone",
};

const CONCERN_BENEFIT: Record<string, string> = {
  acne: "clear breakouts and calm redness",
  dry: "restore moisture and soften dry skin",
  eczema: "soothe irritation and repair the skin barrier",
  oily: "control excess oil without over-drying",
  normal: "maintain a healthy glow and defend against daily damage",
};

function concernBenefit(concern: string): string {
  return (
    CONCERN_BENEFIT[concern.toLowerCase().trim()] ??
    `improve ${concern} and support healthy skin`
  );
}

function ingredientAction(name: string): string {
  return INGREDIENT_ACTION[name] ?? "supports healthy skin";
}

/** "Salicylic Acid unclogs pores and Tea Tree Oil fights bacteria." */
function joinIngredientReasons(names: string[]): string {
  const usable = names.filter(Boolean).slice(0, 2);
  if (usable.length === 0) return "Supports healthy, balanced skin.";
  if (usable.length === 1) {
    const [a] = usable;
    return `${a} ${ingredientAction(a)}.`;
  }
  const [a, b] = usable;
  return `${a} ${ingredientAction(a)} and ${b} ${ingredientAction(b)}.`;
}

function normalize(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return fallback;
}

function lifestyleSentence(
  sleepQuality: string,
  stressLevel: string,
  waterIntake: string,
): string | null {
  const tips: string[] = [];
  const sleep = sleepQuality.toLowerCase();
  const stress = stressLevel.toLowerCase();
  const water = waterIntake.toLowerCase();
  if (
    sleep.includes("poor") ||
    sleep.includes("bad") ||
    sleep.includes("<6") ||
    sleep.includes("less")
  ) {
    tips.push("steady sleep helps overnight repair");
  }
  if (stress.includes("high") || stress.includes("severe")) {
    tips.push("a gentle, consistent routine helps calm stressed skin");
  }
  if (
    water.includes("low") ||
    water.includes("<1") ||
    water.includes("rarely") ||
    water.includes("0_")
  ) {
    tips.push("extra water plus moisturizer supports hydration");
  }
  if (tips.length === 0) return null;
  return tips.join(", ") + ".";
}

/**
 * Rule-based routine built deterministically from the local knowledge base
 * (`data/knowledge.json` via `utils/knowledge`).
 *
 * No LLM involved: given the same skin profile + concern, the output is
 * always the same, which keeps results explainable and offline-friendly.
 */
export function buildRuleBasedRoutine(
  skinType: string,
  mainConcern: string,
  healthScore: number,
  lifestyle?: {
    sleep_quality?: string;
    stress_level?: string;
    water_intake?: string;
  },
): string {
  const safeSkinType = normalize(skinType, "normal");
  const safeConcern = normalize(mainConcern, "normal");
  const score = Number.isFinite(healthScore) ? Math.round(healthScore) : 0;

  let ingredients = getIngredientsForCondition(safeConcern).slice(0, 8);
  let products = getProductsForCondition(safeConcern).slice(0, 4);
  // Unknown concern labels fall back to the "normal" maintenance set so the
  // routine is never empty.
  if (products.length === 0) {
    ingredients = getIngredientsForCondition("normal").slice(0, 8);
    products = getProductsForCondition("normal").slice(0, 4);
  }
  const ingNames = ingredients.map((i) => i.name);
  const pick = (i: number) =>
    ingNames[i % Math.max(ingNames.length, 1)] ?? "Gentle Cleanser";
  const benefit = concernBenefit(safeConcern);

  const cleanser = products[0]?.product_type ?? "Gentle Cleanser";
  const treatment = products[1]?.product_type ?? "Treatment Serum";
  const moisturizer =
    products[2]?.product_type ?? products[0]?.product_type ?? "Moisturizer";

  const step = (
    n: number,
    productType: string,
    instruction: string,
    reason: string,
  ) => ({ step: n, product_type: productType, instruction, reason });

  const lifestyleNote = lifestyle
    ? lifestyleSentence(
        lifestyle.sleep_quality ?? "",
        lifestyle.stress_level ?? "",
        lifestyle.water_intake ?? "",
      )
    : null;

  const summaryBase =
    safeConcern === "normal"
      ? `Your ${safeSkinType} skin looks healthy with a score of ${score}/100. This routine works daily to ${benefit}`
      : `Your ${safeSkinType} skin looks well-managed (${safeConcern}) with a score of ${score}/100. This routine works daily to ${benefit}`;

  const fallback = {
    summary: lifestyleNote ? `${summaryBase}. Also note: ${lifestyleNote}` : `${summaryBase}.`,
    morning_routine: [
      step(
        1,
        cleanser,
        "Massage onto damp skin, then rinse.",
        `${pick(0)} ${ingredientAction(pick(0))} to start the day fresh.`,
      ),
      step(
        2,
        treatment,
        "Apply a thin layer after cleansing.",
        `${pick(1)} ${ingredientAction(pick(1))} where you need it most.`,
      ),
      step(
        3,
        "Sunscreen",
        "Apply generously before sun exposure.",
        "Shields skin from UV damage and premature aging.",
      ),
    ],
    afternoon_routine: [
      step(
        1,
        "Sunscreen",
        "Reapply sunscreen when outdoors.",
        "Maintains UV protection throughout the day.",
      ),
    ],
    evening_routine: [
      step(
        1,
        cleanser,
        "Cleanse to remove the day's buildup.",
        "Clean skin absorbs overnight treatment better.",
      ),
      step(
        2,
        treatment,
        "Apply to clean skin before bed.",
        `${pick(1)} ${ingredientAction(pick(1))} while you sleep.`,
      ),
      step(
        3,
        moisturizer,
        "Lock in hydration before sleep.",
        `${pick(2)} ${ingredientAction(pick(2))} overnight.`,
      ),
    ],
    recommended_products: products.slice(0, 3).map((p) => ({
      product_type: p.product_type,
      recommended_ingredients: p.recommended_ingredients,
      reason: joinIngredientReasons(p.recommended_ingredients),
    })),
  };
  return parseAndValidateRoutine(JSON.stringify(fallback));
}

export type GenerateRoutineInput = {
  skin_type: string;
  main_concern: string;
  sleep_quality: string;
  stress_level: string;
  water_intake: string;
  health_score: number;
  /**
   * Kept for backward compatibility with callers that streamed LLM tokens.
   * Rule-based generation is instant, so this is never called.
   * @deprecated No longer used — routine is rule-based.
   */
  onToken?: (token: string) => void;
};

/**
 * Rule-based entry point (kept async so existing `await generateRoutine()`
 * call sites don't need to change).
 */
export async function generateRoutine({
  skin_type,
  main_concern,
  sleep_quality,
  stress_level,
  water_intake,
  health_score,
}: GenerateRoutineInput): Promise<string> {
  return buildRuleBasedRoutine(skin_type, main_concern, health_score, {
    sleep_quality,
    stress_level,
    water_intake,
  });
}
