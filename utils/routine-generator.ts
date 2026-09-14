import { getLlamaContext } from "./llama";
import { formatKnowledgeForPrompt } from "./knowledge";
import { extractJsonObject } from "./llm-helpers";

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

export async function generateRoutine({
  skin_type,
  main_concern,
  sleep_quality,
  stress_level,
  water_intake,
  health_score,
}: {
  skin_type: string;
  main_concern: string;
  sleep_quality: string;
  stress_level: string;
  water_intake: string;
  health_score: number;
}) {
  const systemPrompt = `You are a dermatologist-approved skincare expert. You create personalized skincare routines. You MUST respond with valid JSON only. No markdown, no code fences, no text before or after the JSON.`;

  const knowledgeBlock = formatKnowledgeForPrompt(main_concern);

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

INSTRUCTIONS:
1. summary: Write 1-2 sentences about the user's skin and what the routine will address. Be specific to their skin type and concern.
2. morning_routine: 3-4 steps. Step 1 is always a cleanser. Step 2 is treatment if needed. Last step is always sunscreen.
3. afternoon_routine: 1-2 steps. Focus on sun protection reapplication.
4. evening_routine: 3-4 steps. Step 1 is always a cleanser. Step 2 is treatment. Last step is moisturizer.
5. Each step object must have: step (number), product_type (string), instruction (1 sentence), reason (1 sentence explaining why this step helps).
6. recommended_products: List 3-4 product types with ingredients from the list above. Each must have product_type, recommended_ingredients (array), and reason (1 sentence).

JSON FORMAT:
{"summary":"Your ${skin_type} skin with ${main_concern} concerns needs...","morning_routine":[{"step":1,"product_type":"Gentle Foaming Cleanser","instruction":"Massage a small amount onto damp skin, then rinse with lukewarm water.","reason":"Salicylic Acid unclogs pores and Tea Tree Oil fights bacteria."},{"step":2,"product_type":"Acne Treatment Serum","instruction":"Apply a thin layer to affected areas after cleansing.","reason":"Benzoyl Peroxide kills acne-causing bacteria."},{"step":3,"product_type":"Oil-Free Moisturizer","instruction":"Apply a lightweight layer to face and neck.","reason":"Niacinamide controls oil while Hyaluronic Acid hydrates without clogging pores."},{"step":4,"product_type":"Sunscreen","instruction":"Apply generously 15 minutes before sun exposure.","reason":"Protects skin from UV damage and prevents acne marks from darkening."}],"afternoon_routine":[{"step":1,"product_type":"Sunscreen","instruction":"Reapply sunscreen every 2 hours when outdoors.","reason":"Maintains UV protection throughout the day."}],"evening_routine":[{"step":1,"product_type":"Gentle Foaming Cleanser","instruction":"Double cleanse to remove sunscreen and impurities.","reason":"Clean skin allows treatments to penetrate better."},{"step":2,"product_type":"Acne Treatment Serum","instruction":"Apply to clean skin, focusing on problem areas.","reason":"Overnight treatment targets breakouts while you sleep."},{"step":3,"product_type":"Oil-Free Moisturizer","instruction":"Apply a thin layer to lock in hydration.","reason":"Repairs the skin barrier overnight without greasiness."}],"recommended_products":[{"product_type":"Gentle Foaming Cleanser","recommended_ingredients":["Salicylic Acid","Tea Tree Oil"],"reason":"Unclogs pores and reduces bacteria without over-drying."},{"product_type":"Acne Treatment Serum","recommended_ingredients":["Benzoyl Peroxide","Niacinamide"],"reason":"Kills bacteria and reduces inflammation and redness."},{"product_type":"Oil-Free Moisturizer","recommended_ingredients":["Niacinamide","Hyaluronic Acid"],"reason":"Hydrates and controls oil production without clogging pores."},{"product_type":"Sunscreen SPF 30+","recommended_ingredients":["Zinc Oxide"],"reason":"Protects against UV damage and prevents post-acne hyperpigmentation."}]}`;

  const context = await getLlamaContext();
  const { text } = await context.completion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    n_predict: 4096,
    temperature: 0.3,
    top_p: 0.9,
    stop: ["</s>", "<|eot_id|>", "<|end_of_text|>"],
    chat_template_kwargs: { enable_thinking: false },
  });

  console.log("LLAMA.RN RESPONSE:", text);

  const jsonStr = extractJsonObject(text);
  return parseAndValidateRoutine(jsonStr);
}

export { preloadLlama, releaseLlama } from "./llama";
