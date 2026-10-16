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
