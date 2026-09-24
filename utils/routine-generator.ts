import { diagnoseLlama, getLlamaContext, runExclusive } from "./llama";
import { getIngredientsForCondition, getProductsForCondition } from "./knowledge";
import { extractJsonObject } from "./llm-helpers";
import { getDeviceTier, getLlamaPerfConfig } from "./device-perf";

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

/**
 * Compact knowledge block: names only, capped lines.
 *
 * The old formatKnowledgeForPrompt() embedded full ingredient descriptions
 * (~400-600 tokens). The model only needs the allowed vocabulary — it
 * already knows what each ingredient does. This cuts prefill time ~30%.
 */
function buildCompactKnowledge(mainConcern: string): string {
  const ingredients = getIngredientsForCondition(mainConcern).slice(0, 8);
  const products = getProductsForCondition(mainConcern).slice(0, 6);
  const lines: string[] = [];
  if (ingredients.length > 0) {
    lines.push(
      `Ingredients: ${ingredients.map((i) => i.name).join(", ")}`,
    );
  }
  if (products.length > 0) {
    lines.push(
      `Products: ${products
        .map((p) => `${p.product_type} (${p.recommended_ingredients.join("/")})`)
        .join("; ")}`,
    );
  }
  return lines.join("\n");
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

/**
 * Deterministic fallback built from the local knowledge base — no LLM.
 * Guarantees the UI never sees "Couldn't generate your routine" just
 * because the tiny on-device model fumbled the JSON.
 */
function buildTemplateRoutine(
  skinType: string,
  mainConcern: string,
  healthScore: number,
): string {
  const ingredients = getIngredientsForCondition(mainConcern).slice(0, 8);
  const products = getProductsForCondition(mainConcern).slice(0, 4);
  const ingNames = ingredients.map((i) => i.name);
  const pick = (i: number) =>
    ingNames[i % Math.max(ingNames.length, 1)] ?? "Gentle Cleanser";
  const benefit = concernBenefit(mainConcern);

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

  const fallback = {
    summary: `Your ${skinType} skin looks ${mainConcern === "normal" ? "healthy" : `well-managed (${mainConcern})`} with a score of ${healthScore}/100. This routine works daily to ${benefit}.`,
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

const MAX_ROUTINE_ATTEMPTS = 3;

export async function generateRoutine({
  skin_type,
  main_concern,
  sleep_quality,
  stress_level,
  water_intake,
  health_score,
  onToken,
}: {
  skin_type: string;
  main_concern: string;
  sleep_quality: string;
  stress_level: string;
  water_intake: string;
  health_score: number;
  /** Optional streaming callback (token text) for progress UI. */
  onToken?: (token: string) => void;
}) {
  const systemPrompt = `You are a dermatologist-approved skincare expert. You create personalized skincare routines. You MUST respond with valid JSON only. No markdown, no code fences, no text before or after the JSON. Keep every "instruction" and "reason" to one short sentence under 12 words.`;

  const knowledgeBlock = buildCompactKnowledge(main_concern);

  // Compact prompt, but keeps a one-step example: the 0.6B model needs a
  // format anchor, and the full-routine example it replaced cost ~500 tokens.
  const userPrompt = `Create a personalized skincare routine. Output ONLY valid JSON.

USER PROFILE:
- Skin type: ${skin_type}
- Main concern: ${main_concern}
- Sleep quality: ${sleep_quality}
- Stress level: ${stress_level}
- Water intake: ${water_intake}
- Health score: ${health_score}/100

INGREDIENTS AND PRODUCTS TO USE (you MUST use these):
${knowledgeBlock}

RULES:
1. summary: 1 sentence about their skin and what the routine addresses.
2. morning_routine: 3 steps (cleanser, treatment, sunscreen).
3. afternoon_routine: 1 step (sunscreen reapply).
4. evening_routine: 3 steps (cleanser, treatment, moisturizer).
5. Each step: {"step":1,"product_type":"...","instruction":"...","reason":"..."}.
6. recommended_products: 3 items with product_type, recommended_ingredients, reason.
7. Start your answer with { and end with }.

EXAMPLE STEP: {"step":1,"product_type":"Gentle Foaming Cleanser","instruction":"Massage onto damp skin, then rinse.","reason":"Salicylic Acid unclogs pores gently."}`;

  const perf = getLlamaPerfConfig(getDeviceTier());
  const context = await getLlamaContext();
  const partialCallback = onToken
    ? (data: unknown) => {
        const tok =
          typeof data === "object" && data !== null && "token" in data
            ? String((data as { token: unknown }).token)
            : "";
        if (tok) onToken(tok);
      }
    : undefined;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ROUTINE_ATTEMPTS; attempt++) {
    // Attempt 1 uses the fast no-thinking path. Qwen3 is a reasoning model
    // and some llama.cpp builds end the generation immediately on the
    // no-think template path — so retries allow thinking (the <think> block
    // is stripped before JSON parsing) with extra token budget for it.
    const allowThinking = attempt > 1;
    const attemptSystem = allowThinking
      ? `You are a dermatologist-approved skincare expert. You may think briefly inside <think> tags, then output ONLY the final valid JSON routine. No markdown, no code fences around the JSON. Keep every "instruction" and "reason" to one short sentence under 12 words.`
      : systemPrompt;
    try {
      // Serialized: overlapping completions on the shared context corrupt
      // each other and return empty text.
      const baseParams = {
        messages: [
          { role: "system", content: attemptSystem },
          { role: "user", content: userPrompt },
        ],
        n_predict: allowThinking ? perf.n_predict + 600 : perf.n_predict,
        temperature: attempt === 1 ? 0.3 : 0.5,
        top_k: perf.top_k,
        top_p: 0.9,
        stop: ["</s>", "<|eot_id|>", "<|end_of_text|>", "```"],
      };
      const params = allowThinking
        ? baseParams
        : {
            ...baseParams,
            chat_template_kwargs: { enable_thinking: false },
          };
      const res = await runExclusive(() =>
        partialCallback
          ? context.completion({ ...params }, partialCallback)
          : context.completion({ ...params }),
      );
      console.log(
        `[routine-generator] attempt ${attempt} (mode=${allowThinking ? "think" : "no-think"}) telemetry: ` +
          `text=${res.text?.length ?? 0} content=${res.content?.length ?? 0} ` +
          `reasoning=${res.reasoning_content?.length ?? 0} ` +
          `predicted=${res.tokens_predicted} evaluated=${res.tokens_evaluated} ` +
          `eos=${res.stopped_eos} stopWord=${JSON.stringify(res.stopped_word ?? "")} ` +
          `truncated=${res.truncated} contextFull=${res.context_full} ` +
          `promptMs=${res.timings?.prompt_ms} predictedMs=${res.timings?.predicted_ms}`,
      );
      // Some builds surface the answer in `content` (thinking filtered out);
      // prefer it when present, otherwise use raw `text`.
      const raw =
        res.content && res.content.trim() ? res.content : (res.text ?? "");
      if (!raw.trim()) {
        throw new Error(
          `Model returned empty output (predicted=${res.tokens_predicted}, eos=${res.stopped_eos}, contextFull=${res.context_full}).`,
        );
      }
      const jsonStr = extractJsonObject(raw);
      return parseAndValidateRoutine(jsonStr);
    } catch (err) {
      lastError = err;
      console.warn(`[routine-generator] attempt ${attempt} failed:`, err);
    }
  }

  // All attempts failed: run the tiny probe so the logs show whether the
  // model itself is broken (probe empty too) or just this prompt.
  try {
    const diagnosis = await diagnoseLlama();
    console.warn(
      "[routine-generator] probe diagnosis:",
      JSON.stringify(diagnosis),
    );
  } catch (probeErr) {
    console.warn("[routine-generator] probe failed:", probeErr);
  }
  console.warn(
    "[routine-generator] all LLM attempts failed, using template fallback.",
    lastError,
  );
  return buildTemplateRoutine(skin_type, main_concern, health_score);
}

export {
  preloadLlama,
  releaseLlama,
  warmupLlama,
  diagnoseLlama,
} from "./llama";
export { getDeviceTier, getLlamaPerfConfig } from "./device-perf";
