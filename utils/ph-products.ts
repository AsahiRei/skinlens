import { PH_PRODUCTS } from "@/data/ph-products";
import type { PhProduct } from "@/types/knowledge";
import type { ChatTurn, ChatUserContext } from "@/types/chat";

/** Ingredient aliases → canonical knowledge-base name. */
const INGREDIENT_ALIASES: [RegExp, string][] = [
  [/\bniacinamide\b|\bvitamin b3\b/, "Niacinamide"],
  [/\bsalicylic\b|\bbha\b/, "Salicylic Acid"],
  [/\bbenzoyl\b/, "Benzoyl Peroxide"],
  [/\bazelaic\b/, "Azelaic Acid"],
  [/\bretinol\b|\bretinoid/, "Retinol"],
  [/\bglycolic\b|\baha\b/, "Glycolic Acid"],
  [/\blactic acid\b/, "Lactic Acid"],
  [/\bhyaluronic\b|\bsodium hyaluronate\b/, "Hyaluronic Acid"],
  [/\bceramides?\b/, "Ceramides"],
  [/\bsqualane\b/, "Squalane"],
  [/\bpetrolatum\b|\bpetroleum jelly\b/, "Petrolatum"],
  [/\burea\b/, "Urea"],
  [/\bcolloidal oat|\boatmeal\b/, "Colloidal Oatmeal"],
  [/\bpanthenol\b|\bvitamin b5\b|\bb5\b/, "Panthenol"],
  [/\bcentella\b|\bcica\b/, "Centella Asiatica"],
  [/\baloe\b/, "Aloe Vera"],
  [/\btea tree\b/, "Tea Tree Oil"],
  [/\bgreen tea\b/, "Green Tea Extract"],
  [/\bclay\b|\bkaolin\b|\bbentonite\b/, "Clay (Kaolin/Bentonite)"],
  [/\bsulfur\b|\bsulphur\b/, "Sulfur"],
  [/\bzinc\b/, "Zinc PCA"],
  [/\bvitamin c\b|\bvit c\b|\bascorbic\b/, "Vitamin C"],
  [/\bvitamin e\b|\btocopherol\b/, "Vitamin E"],
  [/\bpeptides?\b/, "Peptides"],
  [/\bsnail\b/, "Snail Mucin"],
  [/\ballantoin\b/, "Allantoin"],
  [/\bshea\b/, "Shea Butter"],
  [/\bsunscreen\b|\bsunblock\b|\bspf\b/, "Sunscreen"],
];

/** Canonical ingredient names mentioned in free text (order of first mention). */
export function extractIngredientNames(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: { name: string; at: number }[] = [];
  for (const [re, name] of INGREDIENT_ALIASES) {
    const m = lower.match(re);
    if (m && m.index != null && !hits.some((h) => h.name === name)) {
      hits.push({ name, at: m.index });
    }
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}

const PRODUCT_NOUNS =
  /\b(products?|serums?|moisturi[sz]ers?|cleansers?|sunscreens?|sunblock|toners?|creams?|lotions?|essences?|ampoules?|masks?|brands?|gels?)\b/;
const ASK_WORDS =
  /\b(recommend|suggest|best|good|what|which|any|buy|where|price|cost|available|philippines|ph|pinas|shopee|lazada|watsons|mercury|local|sample|example|give|show|list|try|use)\b/;
const FOLLOW_UP =
  /based on (your|what you|that)|you (suggested|recommended|mentioned)|those (ingredients|products)|from your (suggestion|recommendation)/;

/** Should this message get Philippine product cards? */
export function isPhProductIntent(message: string): boolean {
  const q = message.toLowerCase();
  if (FOLLOW_UP.test(q)) return true;
  if (/\b(shopee|lazada|watsons|mercury drug)\b/.test(q)) return true;
  if (PRODUCT_NOUNS.test(q) && ASK_WORDS.test(q)) return true;
  // "where can I buy niacinamide?"
  return (
    /\b(buy|where to get|where can i get|price of)\b/.test(q) &&
    extractIngredientNames(q).length > 0
  );
}

/** Ingredients from the user's latest scan recommendations ("Serum (Niacinamide, BHA); ..."). */
function ingredientsFromRecommendations(ctx?: ChatUserContext): string[] {
  const raw = ctx?.recommendations_summary;
  if (!raw) return [];
  return extractIngredientNames(raw);
}

/**
 * Decide WHICH ingredients to find products for, most specific first:
 *  1. ingredients named in the user's message
 *  2. ingredients the assistant suggested in the last two replies
 *  3. ingredients from the user's latest scan recommendations
 */
export function resolveSuggestedIngredients(
  message: string,
  history: ChatTurn[],
  ctx?: ChatUserContext,
): string[] {
  const fromMessage = extractIngredientNames(message);
  if (fromMessage.length > 0) return fromMessage;

  const recentAssistant = history
    .filter((t) => t.role === "assistant")
    .slice(-2)
    .map((t) => t.content)
    .join(" ");
  const fromHistory = extractIngredientNames(recentAssistant);
  if (fromHistory.length > 0) return fromHistory;

  return ingredientsFromRecommendations(ctx);
}

/** Map free-text profile fields onto the catalog's good_for tags. */
function profileTags(ctx?: ChatUserContext): Set<string> {
  const text =
    `${ctx?.skin_type ?? ""} ${ctx?.main_concerns ?? ""} ${ctx?.detection_label ?? ""}`.toLowerCase();
  const tags = new Set<string>();
  const add = (re: RegExp, tag: string) => {
    if (re.test(text)) tags.add(tag);
  };
  add(/oily|sebum|shine/, "oily");
  add(/dry|flak/, "dry");
  add(/sensitiv|redness|irritat/, "sensitive");
  add(/acne|pimple|breakout|blackhead|whitehead/, "acne");
  add(/combination/, "combination");
  add(/eczema|dermatitis/, "eczema");
  add(/dark spot|pigment|melasma|uneven/, "dark spots");
  add(/aging|wrinkle|fine line/, "aging");
  add(/normal/, "normal");
  return tags;
}

/** Product-type words in the message narrow the results ("niacinamide serum"). */
function requestedType(message: string): string | null {
  const q = message.toLowerCase();
  const types: [RegExp, string][] = [
    [/serum|ampoule|essence/, "serum"],
    [/moisturi[sz]er|cream|lotion|gel cream/, "moistur"],
    [/cleanser|facial wash|face wash/, "cleanser"],
    [/sunscreen|sunblock|spf/, "sunscreen"],
    [/toner/, "toner"],
    [/mask/, "mask"],
    [/spot treatment|pimple patch/, "spot"],
  ];
  for (const [re, t] of types) if (re.test(q)) return t;
  return null;
}

/**
 * Pick up to `limit` catalog products for the suggested ingredients, skipping anything containing
 * an ingredient from the user's sensitivity log, preferring products tagged for the user's skin
 * type/concerns, and covering as many different ingredients as possible.
 */
export function findPhProducts(opts: {
  ingredients: string[];
  message: string;
  ctx?: ChatUserContext;
  limit?: number;
}): PhProduct[] {
  const { ingredients, message, ctx, limit = 4 } = opts;
  if (ingredients.length === 0) return [];

  const avoid = new Set((ctx?.avoid_ingredients ?? []).map((a) => a.toLowerCase()));
  const tags = profileTags(ctx);
  const type = requestedType(message);
  const wanted = new Set(ingredients.map((i) => i.toLowerCase()));

  const scored = PH_PRODUCTS.flatMap((p) => {
    const keys = p.key_ingredients.map((k) => k.toLowerCase());
    if (keys.some((k) => avoid.has(k))) return [];
    const matched = p.key_ingredients.filter((k) => wanted.has(k.toLowerCase()));
    if (matched.length === 0) return [];
    let score = matched.length * 10;
    // Earlier (more specific) ingredients win ties.
    score -= Math.min(
      ...matched.map((m) => ingredients.findIndex((i) => i.toLowerCase() === m.toLowerCase())),
    );
    score += p.good_for.filter((g) => tags.has(g)).length * 3;
    if (type && p.product_type.toLowerCase().includes(type)) score += 8;
    return [{ product: { ...p, matched }, score }];
  });
  scored.sort((a, b) => b.score - a.score);

  // Round-robin by ingredient so "niacinamide + ceramides" shows both.
  const picked: PhProduct[] = [];
  const covered = new Set<string>();
  for (const { product } of scored) {
    if (picked.length >= limit) break;
    const fresh = product.matched!.some((m) => !covered.has(m));
    if (!fresh) continue;
    picked.push(product);
    product.matched!.forEach((m) => covered.add(m));
  }
  for (const { product } of scored) {
    if (picked.length >= limit) break;
    if (!picked.some((p) => p.id === product.id)) picked.push(product);
  }
  return picked;
}

/** Compact catalog lines for the LLM prompt, so its text names the same products the cards show. */
export function formatPhProductsForPrompt(items: PhProduct[]): string {
  if (items.length === 0) return "";
  const lines = items.map(
    (p) =>
      `- ${p.brand} ${p.name} (${p.product_type}, ${p.key_ingredients.join(", ")}, approx. ${p.price})`,
  );
  return `PHILIPPINE PRODUCT EXAMPLES (shown to the user as cards below your reply):\n${lines.join("\n")}`;
}

export type ShopLink = { label: string; url: string };

/** Store SEARCH links (stable, unlike individual listings). */
export function shopLinksFor(p: PhProduct): ShopLink[] {
  const q = encodeURIComponent(`${p.brand} ${p.name}`);
  return [
    { label: "Shopee", url: `https://shopee.ph/search?keyword=${q}` },
    { label: "Lazada", url: `https://www.lazada.com.ph/catalog/?q=${q}` },
    { label: "Watsons", url: `https://www.watsons.com.ph/search?text=${q}` },
  ];
}

export const PH_PRICE_NOTE =
  "Prices are approximate and vary by seller. Buy from official brand stores (Shopee Mall, LazMall, Watsons) to avoid fakes.";
