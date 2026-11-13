import { products as knowledgeProducts } from "@/data/knowledge";
import type { ProductEntry, ProductRole } from "@/types/knowledge";
import { type SafetyExclusion, getProductsForCondition, selectForProfile } from "./knowledge";
import { safetyExclusions } from "./safety";

/** Actives that commonly irritate; recommending any of them adds a patch-test reminder. */
const ACTIVE_INGREDIENTS = new Set([
  "Adapalene",
  "Bakuchiol",
  "Salicylic Acid",
  "Benzoyl Peroxide",
  "Retinol",
  "Azelaic Acid",
  "Glycolic Acid",
  "Lactic Acid",
  "Tea Tree Oil",
  "Sulfur",
  "Vitamin C",
  "Urea",
]);

const PATCH_TEST_NOTE =
  "These are ingredients commonly recommended for your concern, not a guarantee they suit you — patch-test each new product on a small area for 2–3 days, and stop if it stings, burns or itches.";

function parseAndValidateRoutine(jsonStr: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("Failed to parse routine JSON: " + jsonStr.slice(0, 200));
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Routine JSON is not an object");
  }

  if (typeof parsed.summary !== "string") {
    parsed.summary = "Your personalized skincare routine.";
  }

  const routineKeys = ["morning_routine", "afternoon_routine", "evening_routine"] as const;

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
        if (typeof step.product_type !== "string") step.product_type = "Skincare Product";
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
      if (typeof prod.product_type !== "string") prod.product_type = "Skincare Product";
      if (!Array.isArray(prod.recommended_ingredients)) prod.recommended_ingredients = [];
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
  "Azelaic Acid": "clears pores and fades post-acne marks",
  "Glycolic Acid": "gently refines texture and tone",
  "Zinc PCA": "controls excess oil and shine",
  "Green Tea Extract": "calms inflammation and excess oil",
  Sulfur: "dries excess oil and clears pores",
  Ceramides: "rebuilds the moisture barrier",
  "Hyaluronic Acid": "draws in deep, lasting hydration",
  "Colloidal Oatmeal": "soothes itching and irritation",
  Squalane: "softens skin without irritation",
  "Shea Butter": "deeply nourishes and softens skin",
  Glycerin: "locks moisture into the skin",
  Petrolatum: "seals in moisture and shields the barrier",
  Urea: "softens rough, scaly skin",
  "Lactic Acid": "gently smooths and hydrates",
  Panthenol: "soothes and supports barrier repair",
  "Jojoba Oil": "softens skin with sebum-like moisture",
  Dimethicone: "locks in moisture and shields skin",
  Allantoin: "calms irritation and softens skin",
  "Aloe Vera": "cools and calms irritation",
  "Centella Asiatica": "calms redness and supports healing",
  "Vitamin E": "nourishes and defends against damage",
  "Zinc Oxide": "shields skin with mineral UV protection",
  "Clay (Kaolin/Bentonite)": "absorbs excess oil and impurities",
  "Vitamin C": "brightens skin and defends against damage",
  Peptides: "supports firmness and elasticity",
  Adapalene: "unclogs pores and prevents new breakouts",
  "Titanium Dioxide": "adds gentle mineral UV protection",
  "Mineral Oil": "seals in moisture to stop water loss",
  Bakuchiol: "smooths texture as a gentler retinol alternative",
  "Sunflower Seed Oil": "supports the barrier and softens dry skin",
};

const CONCERN_BENEFIT: Record<string, string> = {
  acne: "clear breakouts and calm redness",
  dry: "restore moisture and soften dry skin",
  eczema: "soothe irritation and repair the skin barrier",
  oily: "control excess oil without over-drying",
  normal: "maintain a healthy glow and defend against daily damage",
  none: "maintain a healthy glow and defend against daily damage",
};

/** Noun form of a concern for summary text ("a focus on dryness", not "a focus on dry"). */
const CONCERN_NOUN: Record<string, string> = {
  acne: "acne",
  dry: "dryness",
  eczema: "eczema",
  oily: "oiliness",
};

/** Summary wording follows the score so a 24/100 never reads as "looks healthy". */
function scoreStanding(score: number): string {
  if (score >= 85) return "is in great shape";
  if (score >= 70) return "is doing well";
  if (score >= 50) return "has room to improve";
  return "needs some extra care";
}

function concernBenefit(concern: string): string {
  return (
    CONCERN_BENEFIT[concern.toLowerCase().trim()] ?? `improve ${concern} and support healthy skin`
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
  // Setup / edit-profile store "less_than_500ml" and "500ml_to_1l" for under a liter a day;
  // the other checks keep older free-text values working.
  if (
    water === "less_than_500ml" ||
    water === "500ml_to_1l" ||
    water.includes("low") ||
    water.includes("<1") ||
    water.includes("rarely")
  ) {
    tips.push("extra water plus moisturizer supports hydration");
  }
  if (tips.length === 0) return null;
  return tips.join(", ") + ".";
}

/**
 * Rule-based routine built deterministically from the local knowledge base (`data/knowledge.json`
 * via `utils/knowledge`).
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
  profile?: {
    profile_concerns?: string | null;
    avoid_ingredients?: string[] | null;
    safety_exclusions?: SafetyExclusion[] | null;
  },
): string {
  const safeSkinType = normalize(skinType, "normal");
  const safeConcern = normalize(mainConcern, "normal");
  const score = Number.isFinite(healthScore) ? Math.round(healthScore) : 0;

  // Personalised (but still purely rule-based) ranking: condition first,
  // then skin type / profile concerns re-order the same knowledge base,
  // then logged sensitivities drop ingredients when alternatives exist.
  const selection = selectForProfile({
    condition: safeConcern,
    skin_type: safeSkinType,
    profile_concerns: profile?.profile_concerns ?? null,
    avoid_ingredients: profile?.avoid_ingredients ?? null,
    safety_exclusions: profile?.safety_exclusions ?? null,
  });
  // Products are picked PER ROLE (best-ranked cleanser, treatment, moisturizer…), not by list
  // position — position-based picking once turned a spot treatment into "the cleanser".
  // Fallbacks (the "normal" set, then any product of that role) are filtered by the same
  // triggers and safety exclusions, so they can never bring back something the user reacted to.
  const blocked = new Set(
    [
      ...(profile?.avoid_ingredients ?? []),
      ...(profile?.safety_exclusions ?? []).map((x) => x.ingredient),
    ].map((n) => n.toLowerCase()),
  );
  const allowed = (p: ProductEntry) =>
    p.recommended_ingredients.every((i) => !blocked.has(i.toLowerCase()));
  const pickRole = (role: ProductRole): ProductEntry | null =>
    selection.products.find((p) => p.role === role) ??
    getProductsForCondition("normal").find((p) => p.role === role && allowed(p)) ??
    knowledgeProducts.find((p) => p.role === role && allowed(p)) ??
    null;

  const cleanserP = pickRole("cleanser");
  // A treatment step only appears when one is relevant to THIS concern — falling back to an
  // unrelated serum once gave eczema-prone skin a vitamin C serum. No relevant treatment means
  // moisturizing is the treatment.
  const treatmentP = selection.products.find((p) => p.role === "treatment") ?? null;
  const moisturizerP = pickRole("moisturizer");
  const sunscreenP = pickRole("sunscreen");
  // A mask/exfoliant is only suggested when it is specifically relevant (ranked for this concern).
  // Two evening-only actives (e.g. a retinoid plus an AHA) are a common irritation trap — skip it.
  const occasionalCandidate =
    selection.products.slice(0, 6).find((p) => p.role === "occasional") ?? null;
  const occasionalP =
    occasionalCandidate && !(occasionalCandidate.night_only && treatmentP?.night_only)
      ? occasionalCandidate
      : null;

  const cleanser = cleanserP?.product_type ?? "Gentle Cleanser";
  const treatment = treatmentP?.product_type ?? "Treatment Serum";
  const moisturizer = moisturizerP?.product_type ?? "Moisturizer";
  const sunscreen = sunscreenP?.product_type ?? "Sunscreen";
  const benefit = concernBenefit(safeConcern);

  /** "Benzoyl Peroxide kills breakout-causing bacteria" — from the product's own key active. */
  const reasonFor = (p: ProductEntry | null, fallback: string) => {
    const lead = p?.recommended_ingredients[0];
    return lead ? `${lead} ${ingredientAction(lead)}` : fallback;
  };

  const step = (n: number, productType: string, instruction: string, reason: string) => ({
    step: n,
    product_type: productType,
    instruction,
    reason,
  });

  const lifestyleNote = lifestyle
    ? lifestyleSentence(
        lifestyle.sleep_quality ?? "",
        lifestyle.stress_level ?? "",
        lifestyle.water_intake ?? "",
      )
    : null;

  // "none" (setup's "no concern" answer) means the same as "normal": a maintenance routine.
  const concernKey = safeConcern.toLowerCase();
  const isMaintenance = concernKey === "normal" || concernKey === "none";
  const standing = scoreStanding(score);
  const summaryBase = isMaintenance
    ? `Your ${safeSkinType} skin ${standing} (score ${score}/100). This routine works daily to ${benefit}`
    : `Your ${safeSkinType} skin ${standing}, with a focus on ${CONCERN_NOUN[concernKey] ?? safeConcern} (score ${score}/100). This routine works daily to ${benefit}`;

  // Personalisation notes (skin type tuning, sensitivity exclusions) come
  // straight from selectForProfile — same deterministic input → output.
  const recommendsActive = [cleanserP, treatmentP, moisturizerP, occasionalP].some((p) =>
    p?.recommended_ingredients.some((i) => ACTIVE_INGREDIENTS.has(i)),
  );
  const summaryTail = [
    ...selection.notes,
    lifestyleNote ? `Also note: ${lifestyleNote}` : "",
    recommendsActive ? PATCH_TEST_NOTE : "",
  ]
    .filter(Boolean)
    .join(" ");
  const summary = summaryTail ? `${summaryBase}. ${summaryTail}` : `${summaryBase}.`;

  const fallback = {
    summary: summary,
    morning_routine: [
      step(
        1,
        cleanser,
        "Massage onto damp skin, then rinse.",
        `${reasonFor(cleanserP, "A gentle cleanse")} to start the day fresh.`,
      ),
      // Evening-only treatments (retinoids, AHAs) never go in the morning: use the moisturizer.
      treatmentP && !treatmentP.night_only
        ? step(
            2,
            treatment,
            "Apply a thin layer after cleansing.",
            `${reasonFor(treatmentP, "It targets your concern")} where you need it most.`,
          )
        : step(
            2,
            moisturizer,
            "Apply a thin layer after cleansing.",
            `${reasonFor(moisturizerP, "It keeps skin hydrated")} through the day.`,
          ),
      step(
        3,
        sunscreen,
        "Apply generously as the last step, before sun exposure.",
        `${reasonFor(sunscreenP, "Broad-spectrum SPF 30+ protects against UV damage")}${treatmentP?.night_only ? " — extra important while using a retinoid" : ""}.`,
      ),
    ],
    afternoon_routine: [
      step(
        1,
        sunscreen,
        "Reapply every 2 hours when outdoors.",
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
      ...(treatmentP
        ? [
            step(
              2,
              treatment,
              treatmentP.night_only
                ? "Apply a pea-sized amount to dry skin, every other night at first."
                : "Apply to clean skin before bed.",
              `${reasonFor(treatmentP, "It targets your concern")} while you sleep.`,
            ),
          ]
        : []),
      step(
        treatmentP ? 3 : 2,
        moisturizer,
        "Lock in hydration before sleep.",
        `${reasonFor(moisturizerP, "It seals in moisture")} overnight.`,
      ),
    ],
    recommended_products: [cleanserP, treatmentP, moisturizerP, occasionalP]
      .filter((p): p is ProductEntry => !!p)
      .filter((p, i, arr) => arr.findIndex((x) => x.product_type === p.product_type) === i)
      .map((p) => ({
        product_type: p.product_type,
        recommended_ingredients: p.recommended_ingredients,
        reason:
          p.role === "occasional"
            ? `Use 1-2 times a week, not daily. ${joinIngredientReasons(p.recommended_ingredients)}`
            : joinIngredientReasons(p.recommended_ingredients),
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
  /** Free-text main concerns from the skin profile (re-ranks knowledge). */
  profile_concerns?: string | null;
  /** Ingredient names from the sensitivity log — never recommended. */
  avoid_ingredients?: string[] | null;
  /** Health profile safety context (pregnancy, prescribed treatment). */
  pregnancy_status?: string | null;
  current_treatment?: string | null;
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
  profile_concerns,
  avoid_ingredients,
  pregnancy_status,
  current_treatment,
}: GenerateRoutineInput): Promise<string> {
  return buildRuleBasedRoutine(
    skin_type,
    main_concern,
    health_score,
    {
      sleep_quality,
      stress_level,
      water_intake,
    },
    {
      profile_concerns,
      avoid_ingredients,
      safety_exclusions: safetyExclusions({ pregnancy_status, current_treatment }),
    },
  );
}
