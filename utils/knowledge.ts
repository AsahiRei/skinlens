import type {
  Ingredient,
  ProductEntry,
  SkinCondition,
} from "@/types/knowledge";
import { ingredients, products } from "@/data/knowledge";

const VALID_CONDITIONS: SkinCondition[] = ["acne", "dry", "eczema", "oily", "normal"];

function normalizeCondition(label: string): SkinCondition {
  const lower = label.toLowerCase().trim();
  if (VALID_CONDITIONS.includes(lower as SkinCondition)) {
    return lower as SkinCondition;
  }
  return "normal";
}

export function getIngredientsForCondition(
  condition: string,
  concerns?: string,
) {
  const primary = normalizeCondition(condition);
  const matched = new Set<string>();

  const result = ingredients.filter((ing) => {
    if (ing.concerns.includes(primary)) {
      if (!matched.has(ing.name)) {
        matched.add(ing.name);
        return true;
      }
    }
    return false;
  });

  if (concerns) {
    const lowerConcerns = concerns.toLowerCase();
    for (const ing of ingredients) {
      if (!matched.has(ing.name) && lowerConcerns.includes(ing.name.toLowerCase())) {
        matched.add(ing.name);
        result.push(ing);
      }
    }
  }

  return result;
}

export function getProductsForCondition(
  condition: string,
  concerns?: string,
) {
  const primary = normalizeCondition(condition);
  const matched = new Set<string>();

  const result = products.filter((prod) => {
    if (prod.concerns.includes(primary)) {
      if (!matched.has(prod.product_type)) {
        matched.add(prod.product_type);
        return true;
      }
    }
    return false;
  });

  if (concerns) {
    const lowerConcerns = concerns.toLowerCase();
    for (const prod of products) {
      if (!matched.has(prod.product_type)) {
        const hasIngredient = prod.recommended_ingredients.some((ing) =>
          lowerConcerns.includes(ing.toLowerCase()),
        );
        if (hasIngredient) {
          matched.add(prod.product_type);
          result.push(prod);
        }
      }
    }
  }

  return result;
}

/**
 * Question-text → skin condition hints. Lets a question like "what helps
 * with blackheads?" pull in the acne knowledge even when the profile's
 * concerns string doesn't mention it.
 */
const QUESTION_CONCERN_HINTS: [SkinCondition, RegExp][] = [
  ["acne", /\b(acne|pimple|breakout|blemish|blackhead|whitehead|comedone|cystic)\b/i],
  ["oily", /\b(oily|oiliness|greasy|shiny|shine|sebum|large pores)\b/i],
  ["dry", /\b(dry|dehydrat|flak|tight|rough texture)\b/i],
  ["eczema", /\b(eczema|atopic|itchy rash|irritat|sensitive skin)\b/i],
];

// The on-device model has a ~2048-token context shared by system prompt,
// profile, knowledge and history — unbounded retrieval would crowd out
// the conversation. Keep the knowledge block small and relevant.
const MAX_PROMPT_INGREDIENTS = 8;
const MAX_PROMPT_PRODUCTS = 4;

export function formatKnowledgeForPrompt(
  condition: string,
  concerns?: string,
  question?: string,
): string {
  const extraConditions = QUESTION_CONCERN_HINTS.filter(([, re]) =>
    question ? re.test(question) : false,
  ).map(([c]) => c);

  const matchedIngredients: Ingredient[] = [];
  const seenIngredients = new Set<string>();
  const collectIngredient = (ing: Ingredient) => {
    if (seenIngredients.has(ing.name)) return;
    seenIngredients.add(ing.name);
    matchedIngredients.push(ing);
  };
  for (const ing of getIngredientsForCondition(condition, concerns)) {
    collectIngredient(ing);
  }
  for (const cond of extraConditions) {
    for (const ing of getIngredientsForCondition(cond)) collectIngredient(ing);
  }
  if (question) {
    const q = question.toLowerCase();
    for (const ing of ingredients) {
      if (q.includes(ing.name.toLowerCase())) collectIngredient(ing);
    }
  }

  const matchedProducts: ProductEntry[] = [];
  const seenProducts = new Set<string>();
  const collectProduct = (prod: ProductEntry) => {
    if (seenProducts.has(prod.product_type)) return;
    seenProducts.add(prod.product_type);
    matchedProducts.push(prod);
  };
  for (const prod of getProductsForCondition(condition, concerns)) {
    collectProduct(prod);
  }
  for (const cond of extraConditions) {
    for (const prod of getProductsForCondition(cond)) collectProduct(prod);
  }
  if (question) {
    const q = question.toLowerCase();
    for (const prod of products) {
      if (q.includes(prod.product_type.toLowerCase())) collectProduct(prod);
    }
  }

  // Question-matched entries matter most for THIS turn — keep them first,
  // then fill up to the caps with profile-matched entries.
  matchedIngredients.sort((a, b) => {
    const aQ = question?.toLowerCase().includes(a.name.toLowerCase()) ? 0 : 1;
    const bQ = question?.toLowerCase().includes(b.name.toLowerCase()) ? 0 : 1;
    return aQ - bQ;
  });
  matchedProducts.sort((a, b) => {
    const aQ = question?.toLowerCase().includes(a.product_type.toLowerCase())
      ? 0
      : 1;
    const bQ = question?.toLowerCase().includes(b.product_type.toLowerCase())
      ? 0
      : 1;
    return aQ - bQ;
  });

  const cappedIngredients = matchedIngredients.slice(0, MAX_PROMPT_INGREDIENTS);
  const cappedProducts = matchedProducts.slice(0, MAX_PROMPT_PRODUCTS);

  if (cappedIngredients.length === 0 && cappedProducts.length === 0) {
    return "";
  }

  const lines: string[] = [];

  if (cappedIngredients.length > 0) {
    lines.push("DERMATOLOGIST-RECOMMENDED INGREDIENTS:");
    for (const ing of cappedIngredients) {
      lines.push(`- ${ing.name}: ${ing.description}`);
    }
  }

  if (cappedProducts.length > 0) {
    lines.push("\nRECOMMENDED PRODUCT TYPES:");
    for (const prod of cappedProducts) {
      lines.push(`- ${prod.product_type}: ${prod.recommended_ingredients.join(", ")}`);
    }
  }

  return lines.join("\n");
}

/* ── Profile-aware selection ───────────────────────────────────────────
 * Personalisation layer for the rule-based routine generator. The detected
 * condition remains the primary signal; the profile's skin type and
 * free-text concerns only re-rank entries from the SAME knowledge base,
 * and the patient's sensitivity log can drop ingredients — still fully
 * deterministic, no LLM involved. */

/** Secondary conditions that a skin type contributes to the ranking. */
const SKIN_TYPE_CONDITIONS: Record<string, SkinCondition[]> = {
  oily: ["oily"],
  dry: ["dry"],
  combination: ["oily", "dry"],
  sensitive: ["eczema"],
  normal: [],
};

/**
 * Floors for sensitivity-based filtering: never strip the routine down to
 * almost nothing — if exclusions would leave fewer items than this, the
 * top-ranked picks are restored (and a patch-test note is added instead).
 */
export const MIN_SELECTED_INGREDIENTS = 4;
export const MIN_SELECTED_PRODUCTS = 2;

function rankBy<T>(items: T[], score: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

export type ProfileSelection = {
  ingredients: Ingredient[];
  products: ProductEntry[];
  /** Short human-readable notes; the routine summary appends these. */
  notes: string[];
};

/**
 * Ranked, personalised picks for a profile:
 *  1. entries matching the detected condition (weight 4),
 *  2. entries matching a condition implied by the skin type (weight 2 —
 *     oily→oily, dry→dry, combination→oily+dry, sensitive→eczema),
 *  3. entries named in the profile's free-text concerns (weight 1),
 * then sensitivity-log ingredients/products are dropped unless that would
 * push the list under its floor.
 */
export function selectForProfile(opts: {
  condition: string;
  skin_type?: string | null;
  profile_concerns?: string | null;
  avoid_ingredients?: string[] | null;
}): ProfileSelection {
  const primary = normalizeCondition(opts.condition ?? "");
  const skinType = (opts.skin_type ?? "").toLowerCase().trim();
  const secondary = SKIN_TYPE_CONDITIONS[skinType] ?? [];
  const concerns = (opts.profile_concerns ?? "").toLowerCase().trim();
  const avoid = new Set(
    (opts.avoid_ingredients ?? [])
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
  const notes: string[] = [];

  const ingScore = (ing: Ingredient): number => {
    let score = 0;
    if (ing.concerns.includes(primary)) score += 4;
    if (secondary.some((c) => ing.concerns.includes(c))) score += 2;
    if (concerns && concerns.includes(ing.name.toLowerCase())) score += 1;
    return score;
  };
  const prodScore = (prod: ProductEntry): number => {
    let score = 0;
    if (prod.concerns.includes(primary)) score += 4;
    if (secondary.some((c) => prod.concerns.includes(c))) score += 2;
    if (
      concerns &&
      prod.recommended_ingredients.some((ing) =>
        concerns.includes(ing.toLowerCase()),
      )
    ) {
      score += 1;
    }
    return score;
  };

  const rankedIngredients = rankBy(ingredients, ingScore);
  const rankedProducts = rankBy(products, prodScore);

  const isAvoided = (name: string) => avoid.has(name.toLowerCase());

  const skippedIngredients = rankedIngredients.filter((i) => isAvoided(i.name));
  let selectedIngredients = rankedIngredients.filter((i) => !isAvoided(i.name));
  if (skippedIngredients.length > 0) {
    if (selectedIngredients.length >= MIN_SELECTED_INGREDIENTS) {
      const names = skippedIngredients
        .slice(0, 3)
        .map((i) => i.name)
        .join(", ");
      notes.push(`Skipped ${names} because of your sensitivity log.`);
    } else {
      selectedIngredients = rankedIngredients.slice(0, MIN_SELECTED_INGREDIENTS);
      notes.push(
        "Some logged triggers stay in the routine in small amounts because it needs them — patch-test first.",
      );
    }
  }

  const containsAvoided = (prod: ProductEntry) =>
    prod.recommended_ingredients.some((ing) => isAvoided(ing));
  const skippedProducts = rankedProducts.filter(containsAvoided);
  let selectedProducts = rankedProducts.filter((p) => !containsAvoided(p));
  if (skippedProducts.length > 0) {
    if (selectedProducts.length >= MIN_SELECTED_PRODUCTS) {
      const names = skippedProducts
        .slice(0, 2)
        .map((p) => p.product_type)
        .join(", ");
      notes.push(`Left out ${names} because of your sensitivity log.`);
    } else {
      selectedProducts = rankedProducts.slice(0, MIN_SELECTED_PRODUCTS);
      notes.push(
        "One recommended product type may contain a logged trigger — check its ingredient list before buying.",
      );
    }
  }

  if (skinType && secondary.length > 0) {
    notes.unshift(`Tuned for your ${skinType} skin type.`);
  }

  return { ingredients: selectedIngredients, products: selectedProducts, notes };
}

/**
 * Ingredient names from the knowledge base that appear anywhere in the
 * patient's sensitivity log (trigger cause + notes are free text, so match
 * by substring on the whole corpus).
 */
export function ingredientsAvoidedBySensitivity(
  entries: { trigger_cause?: string | null; notes?: string | null }[],
): string[] {
  const corpus = entries
    .map((e) => `${e.trigger_cause ?? ""} ${e.notes ?? ""}`)
    .join(" \n ")
    .toLowerCase();
  if (!corpus.trim()) return [];
  const avoid: string[] = [];
  for (const ing of ingredients) {
    const name = ing.name.toLowerCase();
    if (corpus.includes(name) && !avoid.some((a) => a.toLowerCase() === name)) {
      avoid.push(ing.name);
    }
  }
  return avoid;
}
