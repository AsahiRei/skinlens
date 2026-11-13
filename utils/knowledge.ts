import type { Ingredient, PhProduct, ProductEntry, SkinCondition } from "@/types/knowledge";
import { ingredients, products } from "@/data/knowledge";
import { PH_PRODUCTS } from "@/data/ph-products";
import { EVIDENCE_LABEL, evidenceFor, isRejectedByReviewer } from "@/data/derm-validation";

/** How many independent kinds of authority (guideline, regulator, association) back it. */
function authorityCount(name: string): number {
  const v = evidenceFor(name);
  if (!v) return 0;
  return new Set(
    v.sources
      .map((s) => s.type)
      .filter((t) => t === "guideline" || t === "regulatory" || t === "association"),
  ).size;
}

/** Evidence levels as an ordinal, strongest highest. */
const LEVEL_RANK = {
  guideline: 5,
  regulatory: 4,
  association: 3,
  clinical: 2,
  emerging: 1,
} as const;

/** Knowledge-base ingredients in a drug class, e.g. every "retinoid". */
export function ingredientsInClass(cls: string): string[] {
  return ingredients.filter((i) => i.classes?.includes(cls)).map((i) => i.name);
}

const VALID_CONDITIONS: SkinCondition[] = ["acne", "dry", "eczema", "oily", "normal"];

function normalizeCondition(label: string): SkinCondition {
  const lower = label.toLowerCase().trim();
  if (VALID_CONDITIONS.includes(lower as SkinCondition)) {
    return lower as SkinCondition;
  }
  return "normal";
}

export function getIngredientsForCondition(condition: string, concerns?: string) {
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

export function getProductsForCondition(condition: string, concerns?: string) {
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
 * Question-text → skin condition hints. Lets a question like "what helps with blackheads?" pull in
 * the acne knowledge even when the profile's concerns string doesn't mention it.
 */
const QUESTION_CONCERN_HINTS: [SkinCondition, RegExp][] = [
  ["acne", /\b(acne|pimple|breakout|blemish|blackhead|whitehead|comedone|cystic)\b/i],
  ["oily", /\b(oily|oiliness|greasy|shiny|shine|sebum|large pores)\b/i],
  ["dry", /\b(dry|dehydrat|flak|tight|rough texture)\b/i],
  ["eczema", /\b(eczema|atopic|itchy rash|irritat|sensitive skin)\b/i],
];

// The on-device model has a ~2048-token context shared by system prompt, profile, knowledge and
// history — unbounded retrieval would crowd out the conversation.
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
    const aQ = question?.toLowerCase().includes(a.product_type.toLowerCase()) ? 0 : 1;
    const bQ = question?.toLowerCase().includes(b.product_type.toLowerCase()) ? 0 : 1;
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
      // Evidence tag so the model can say how well-supported an ingredient is, and not oversell
      // "limited evidence" ones.
      const level = evidenceFor(ing.name)?.level;
      lines.push(
        `- ${ing.name}${level ? ` [evidence: ${EVIDENCE_LABEL[level]}]` : ""}: ${ing.description}`,
      );
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

/** Profile-aware selection: Personalisation layer for the rule-based routine generator. */

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
  /** Hard exclusions with a user-facing reason (pregnancy, prescribed treatment). */
  safety_exclusions?: SafetyExclusion[] | null;
}): ProfileSelection {
  const primary = normalizeCondition(opts.condition ?? "");
  const skinType = (opts.skin_type ?? "").toLowerCase().trim();
  const secondary = SKIN_TYPE_CONDITIONS[skinType] ?? [];
  const concerns = (opts.profile_concerns ?? "").toLowerCase().trim();
  const avoid = new Set(
    (opts.avoid_ingredients ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const safety = opts.safety_exclusions ?? [];
  const blocked = new Set([
    ...avoid,
    ...safety.map((x) => x.ingredient.toLowerCase()),
    // The project's dermatologist reviewed this use and rejected it (data/derm-validation.json).
    ...ingredients.filter((i) => isRejectedByReviewer(i.name)).map((i) => i.name.toLowerCase()),
  ]);
  const notes: string[] = [];

  // Ranking, most important first:
  //   1. relevance tier — matches the detected/stated condition (3), only the skin type (2), only
  //      a free-text concern (1);
  //   2. evidence level of the ingredient (for a product: its key active, listed first) —
  //      guideline > regulatory > association > clinical > emerging;
  //   3. number of independent authorities (guideline, regulator, association) behind it;
  //   4. also fits the skin type / free-text concerns.
  // So for acne, first-line actives (benzoyl peroxide, adapalene) outrank a clay mask even for oily
  // skin, and a limited-evidence ingredient never leads its tier.
  const rank = (itemConcerns: SkinCondition[], keyIngredient: string, mentioned: boolean) => {
    const primaryHit = itemConcerns.includes(primary);
    const secondaryHit = secondary.some((c) => itemConcerns.includes(c));
    if (!primaryHit && !secondaryHit && !mentioned) return 0;
    const tier = primaryHit ? 3 : secondaryHit ? 2 : 1;
    const level = evidenceFor(keyIngredient)?.level;
    const levelRank = level ? LEVEL_RANK[level] : 0;
    const authorities = authorityCount(keyIngredient);
    const fit = (primaryHit && secondaryHit ? 10 : 0) + (mentioned ? 5 : 0);
    return tier * 1000 + levelRank * 100 + authorities * 20 + fit;
  };
  const ingScore = (ing: Ingredient): number =>
    rank(ing.concerns, ing.name, !!concerns && concerns.includes(ing.name.toLowerCase()));
  const prodScore = (prod: ProductEntry): number =>
    rank(
      prod.concerns,
      prod.recommended_ingredients[0] ?? "",
      !!concerns &&
        prod.recommended_ingredients.some((ing) => concerns.includes(ing.toLowerCase())),
    );

  const rankedIngredients = rankBy(ingredients, ingScore);
  const rankedProducts = rankBy(products, prodScore);

  // Logged triggers and safety exclusions are NEVER put back, even when that leaves few options:
  // recommending something the user reported reacting to is worse than a shorter list.
  const isBlocked = (name: string) => blocked.has(name.toLowerCase());
  const isAvoided = (name: string) => avoid.has(name.toLowerCase());

  const selectedIngredients = rankedIngredients.filter((i) => !isBlocked(i.name));
  const skippedForLog = rankedIngredients.filter((i) => isAvoided(i.name)).map((i) => i.name);
  if (skippedForLog.length > 0) {
    notes.push(`Left out ${joinNames(skippedForLog.slice(0, 3))} because of your sensitivity log.`);
  }
  for (const reason of new Set(
    safety
      .filter((x) => rankedIngredients.some((i) => i.name === x.ingredient))
      .map((x) => x.reason),
  )) {
    notes.push(reason);
  }

  const containsBlocked = (prod: ProductEntry) =>
    prod.recommended_ingredients.some((ing) => isBlocked(ing));
  // Prescription-only in the Philippines (e.g. adapalene): never in an automatic routine — the
  // app must not tell someone to buy a prescription drug — but say it exists when it's relevant.
  const isRxInPh = (name: string) =>
    ingredients.some((i) => i.name === name && i.prescription_in_ph);
  const selectedProducts = rankedProducts.filter(
    (p) => !containsBlocked(p) && !p.recommended_ingredients.some(isRxInPh),
  );
  const relevantRx = rankedIngredients
    .filter((i) => i.prescription_in_ph && i.concerns.includes(primary) && !isBlocked(i.name))
    .map((i) => i.name);
  if (relevantRx.length > 0) {
    notes.push(
      `${joinNames(relevantRx)} — a guideline-recommended option for this — needs a prescription in the Philippines; ask a dermatologist if your skin doesn't improve.`,
    );
  }

  if (
    selectedIngredients.length < MIN_SELECTED_INGREDIENTS ||
    selectedProducts.length < MIN_SELECTED_PRODUCTS
  ) {
    notes.push(
      "Few options in our list avoid all of your triggers — a dermatologist can suggest safe alternatives.",
    );
  }

  if (skinType && secondary.length > 0) {
    notes.unshift(`Tuned for your ${skinType} skin type.`);
  }

  return { ingredients: selectedIngredients, products: selectedProducts, notes };
}

/** A hard exclusion with the sentence shown to the user (see utils/safety.ts). */
export type SafetyExclusion = { ingredient: string; reason: string };

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Everyday names people actually write in a sensitivity note, mapped to knowledge-base
 * ingredients. Without these, "BHA toner stung" or "purging from tretinoin" matched nothing.
 */
const INGREDIENT_ALIASES: Record<string, RegExp> = {
  "Salicylic Acid": /salicylic|\bbha\b|beta[- ]?hydroxy/,
  "Benzoyl Peroxide": /benzoyl/,
  Retinol: /retin(ol|al)\b|\bvitamin a\b/,
  Adapalene: /adapalene|differin/,
  "Titanium Dioxide": /titanium/,
  "Mineral Oil": /mineral oil|baby oil|paraffinum liquidum/,
  Bakuchiol: /bakuchiol/,
  "Sunflower Seed Oil": /sunflower/,
  "Glycolic Acid": /glycolic|\baha\b|alpha[- ]?hydroxy/,
  "Lactic Acid": /lactic|\baha\b|alpha[- ]?hydroxy/,
  "Azelaic Acid": /azelaic/,
  "Tea Tree Oil": /tea ?tree|melaleuca/,
  "Vitamin C": /\bvitamin c\b|\bvit\.? c\b|ascorbic/,
  Niacinamide: /niacinamide|nicotinamide|vitamin b3/,
  Sulfur: /sulfur|sulphur/,
  "Zinc PCA": /zinc pca/,
  "Zinc Oxide": /zinc oxide|mineral sunscreen/,
  "Centella Asiatica": /centella|\bcica\b/,
  "Hyaluronic Acid": /hyaluronic|hyaluronate/,
  "Clay (Kaolin/Bentonite)": /\bclay\b|kaolin|bentonite/,
};

/** Words that name the retinoid class (or a prescription retinoid) rather than one product. */
const RETINOID_CLASS_WORDS = /retinoids?\b|tretinoin|tazarotene|isotretinoin|retinoic/;

const STOP_WORDS = new Set(["with", "the", "and", "for", "face", "skin", "free"]);

/** Distinctive words of a catalog product name ("Oil-Free Acne Wash (2% …)" → oil, acne, wash). */
function productKeywords(name: string): string[] {
  return name
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Catalog products the note refers to: the brand plus at least two of the product's distinctive
 * words ("Neutrogena acne wash" → Neutrogena Oil-Free Acne Wash).
 */
export function catalogProductsMentioned(text: string): PhProduct[] {
  const t = text.toLowerCase();
  return PH_PRODUCTS.filter((p) => {
    if (!t.includes(p.brand.toLowerCase())) return false;
    const words = productKeywords(p.name);
    const hits = words.filter((w) => t.includes(w)).length;
    return hits >= Math.min(2, words.length);
  });
}

/**
 * Knowledge-base ingredients linked to the patient's sensitivity log. Matches exact names, everyday
 * aliases (BHA, retinoid, tretinoin, AHA, cica…) and catalog products by name (their key
 * ingredients). Deliberately conservative: a mention counts even in a sentence like "not sure if
 * it was the retinol", because wrongly skipping an ingredient is safer than wrongly recommending it.
 */
export function ingredientsAvoidedBySensitivity(
  entries: { trigger_cause?: string | null; notes?: string | null }[],
): string[] {
  const corpus = entries
    .map((e) => `${e.trigger_cause ?? ""} ${e.notes ?? ""}`)
    .join(" \n ")
    .toLowerCase();
  if (!corpus.trim()) return [];
  const found = new Set<string>();
  for (const ing of ingredients) {
    const alias = INGREDIENT_ALIASES[ing.name];
    if (corpus.includes(ing.name.toLowerCase()) || (alias && alias.test(corpus))) {
      found.add(ing.name);
    }
  }
  // A reaction to "a retinoid" (or a prescription one like tretinoin) means the whole class.
  if (RETINOID_CLASS_WORDS.test(corpus)) {
    for (const name of ingredientsInClass("retinoid")) found.add(name);
  }
  for (const product of catalogProductsMentioned(corpus)) {
    for (const k of product.key_ingredients) found.add(k);
  }
  // Keep knowledge-base order (stable output) and only names the knowledge base knows.
  return ingredients.map((i) => i.name).filter((n) => found.has(n));
}
