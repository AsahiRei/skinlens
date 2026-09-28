import { ingredients, products } from "@/data/knowledge";
import type { ProductEntry, ProductWithImage } from "@/types/knowledge";
import type { ChatUserContext } from "@/types/chat";

export type IngredientImage = {
  id: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  sourceName: string;
};

type OpenverseResult = {
  id?: string;
  title?: string;
  url?: string;
  thumbnail?: string;
  foreign_landing_url?: string;
  license?: string;
  provider?: string;
  source?: string;
};

const OPENVERSE_BASE = "https://api.openverse.org/v1/images/";
const PEXELS_API_KEY = process.env.EXPO_PUBLIC_PEXELS_API_KEY ?? "";

// React Native <Image> cannot render SVG — and Openverse ingredient queries
// are polluted by Flickr spam (single spammer accounts) + DrugStats SVG
// charts. Filter aggressively: renderable raster only, no Flickr, no charts.
const RENDERABLE_EXT_RE = /\.(jpe?g|png|webp|gif)(\?|$)/i;
const BLOCKED_PROVIDERS = new Set(["flickr"]);
const CHART_TITLE_RE = /drugstats|costs|prescriptions|prescription|chart|graph/i;

const IMAGE_WORDS =
  /\b(show|picture|photo|image|what does .* look|look like|see|display)\b/i;

// Generic cosmetic nouns — let "what does X product/serum look like" trigger
// image search even when X has a typo or isn't in the knowledge base.
const PRODUCT_WORDS =
  /\b(serum|serums|moisturizer|moisturiser|cleanser|sunscreen|toner|cream|creams|lotion|mask|exfoliant|exfoliator|essence|oil|oils|product|products)\b/i;

function messageTokens(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = temp;
    }
  }
  return prev[b.length];
}

/** Typo-tolerant word comparison: exact for short words, 1-2 edits for long. */
function wordsSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 5) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  return levenshtein(a, b) <= (maxLen >= 8 ? 2 : 1);
}

/**
 * True when every word of the known name appears in the message, allowing
 * typos ("niacinimide" ~ "niacinamide", "salicilic acid" ~ "salicylic acid").
 */
function fuzzyNameInMessage(name: string, msgTokens: string[]): boolean {
  const q = msgTokens.join(" ");
  const lower = name.toLowerCase();
  if (q.includes(lower)) return true;
  const nameWords = lower.split(/\s+/).filter((w) => w.length >= 3);
  if (nameWords.length === 0) return false;
  const hits = nameWords.filter((nw) =>
    msgTokens.some((mt) => wordsSimilar(mt, nw)),
  );
  // Single-word names need their one word; multi-word need at least half.
  return hits.length >= Math.max(1, Math.ceil(nameWords.length / 2));
}

/**
 * THE single knowledge-base lookup: canonical ingredient / product-type
 * names mentioned in the message (typo-tolerant), longest first.
 * Intent, related products, and image queries all reuse this — no
 * duplicated matching loops.
 */
export function findKnownNames(message: string): string[] {
  const toks = messageTokens(message);
  const candidates = [
    ...ingredients.map((i) => i.name),
    ...products.map((p) => p.product_type),
  ];
  return candidates
    .filter((c) => fuzzyNameInMessage(c, toks))
    .sort((a, b) => b.length - a.length);
}

/**
 * True when the message asks about a known ingredient / product type.
 * Typo-tolerant ("niacinimide", "salicilic acid"), and also fires for
 * generic "what does this serum/product look like" appearance questions
 * so Pexels can answer even without a knowledge-base hit.
 */
export function isIngredientImageIntent(message: string): boolean {
  if (findKnownNames(message).length > 0) return true;
  // Generic appearance question, e.g. "what does vitamin c serum look like".
  // Requires an explicit image/show word so routine advice questions
  // ("should I use moisturizer?") don't over-fetch.
  return IMAGE_WORDS.test(message) && PRODUCT_WORDS.test(message);
}

/** Fallback query for generic appearance questions with no knowledge hit. */
function cleanFallbackQuery(message: string): string {
  return message
    .replace(
      /\b(please|show|me|give|display|picture|pictures|photo|photos|image|images|of|the|a|an|what|whats|does|do|is|are|look|looks|like)\b/gi,
      " ",
    )
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Product-list questions: "what's the list of products", "list products
 * for acne", "recommend me some products". These get product cards with
 * example photos even without an explicit show/image word.
 */
export function isProductListIntent(message: string): boolean {
  const q = message.toLowerCase();
  const mentionsProducts = /\bproducts?\b/.test(q);
  if (!mentionsProducts) return false;
  return /\b(list|show|recommend|suggest|give|display|what|which)\b/.test(q);
}

const CONCERN_KEYWORDS: Record<string, string[]> = {
  acne: ["acne", "pimple", "breakout", "blackhead", "whitehead"],
  dry: ["dry", "dryness", "flaky", "rough"],
  eczema: ["eczema", "dermatitis", "itchy", "itch", "rash"],
  oily: ["oily", "oiliness", "greasy", "sebum", "shine", "shiny"],
  normal: ["normal", "combination", "balanced", "maintain", "maintenance"],
};

/** Products matching a skin-concern keyword in the message. */
export function getProductsForConcern(
  message: string,
  limit = 3,
): ProductEntry[] {
  const q = message.toLowerCase();
  const out: ProductEntry[] = [];
  const seen = new Set<string>();
  for (const [concern, keywords] of Object.entries(CONCERN_KEYWORDS)) {
    if (!keywords.some((k) => q.includes(k))) continue;
    for (const p of products) {
      if (
        !seen.has(p.product_type) &&
        p.concerns.some((c) => c.toLowerCase() === concern)
      ) {
        seen.add(p.product_type);
        out.push(p);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/**
 * Pexels query per product type. Literal product-type strings
 * ("Oil-Free Moisturizer skincare") match supermarket-shelf spam — generic
 * cosmetic queries ("cosmetic cream jar") return actual product shots.
 */
function productPhotoQuery(p: ProductEntry): string {
  const t = p.product_type.toLowerCase();
  if (t.includes("serum")) return "cosmetic serum bottle dropper";
  if (t.includes("sunscreen")) return "sunscreen bottle lotion";
  if (t.includes("cleanser")) return "facial cleanser foam skincare";
  if (t.includes("toner")) return "facial toner bottle skincare";
  if (t.includes("moisturizer") || t.includes("cream"))
    return "cosmetic moisturizer cream jar";
  if (t.includes("mask")) return "facial mask skincare";
  if (t.includes("exfoliant") || t.includes("exfoliator"))
    return "facial exfoliator scrub skincare";
  return "skincare cosmetic products";
}

/**
 * Attach one example photo per product (Pexels). Never throws — products
 * without a photo still return so the text card renders.
 */
export async function attachProductImages(
  items: ProductEntry[],
): Promise<ProductWithImage[]> {
  return Promise.all(
    items.map(async (p) => {
      try {
        const imgs = await searchPexels(productPhotoQuery(p), 1);
        const first = imgs[0];
        if (!first) return { ...p };
        return {
          ...p,
          imageUrl: first.imageUrl,
          imageSourceUrl: first.sourceUrl,
          imageSourceName: first.sourceName,
        };
      } catch {
        return { ...p };
      }
    }),
  );
}

/**
 * The user's OWN recommended products, parsed directly from their latest
 * scan (recommendations_summary, e.g.
 * "Acne Treatment Serum (Benzoyl Peroxide, Niacinamide); ...").
 * No hardcoded catalog involved — a "recommendation / product list"
 * question shows ONLY these. Returns [] when there is no scan data, in
 * which case the LLM text reply still answers.
 */
export function getRecommendedProducts(
  ctx: ChatUserContext,
  limit = 3,
): ProductEntry[] {
  const raw = ctx.recommendations_summary?.trim() ?? "";
  if (!raw) return [];
  const out: ProductEntry[] = [];
  for (const part of raw.split(";")) {
    const segment = part.trim();
    if (!segment) continue;
    const m = segment.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
    if (m) {
      out.push({
        product_type: m[1].trim().slice(0, 60),
        recommended_ingredients: m[2]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 5),
        concerns: [],
      });
    } else {
      out.push({
        product_type: segment.slice(0, 60),
        recommended_ingredients: [],
        concerns: [],
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Products from the curated knowledge base that use the matched
 * ingredient (or the mentioned product type itself).
 * e.g. "show me niacinamide" -> Acne Treatment Serum, Oil-Free Moisturizer…
 */
export function getRelatedProducts(message: string, limit = 3): ProductEntry[] {
  const matched = new Set(findKnownNames(message).map((n) => n.toLowerCase()));
  const matchedIngredients = ingredients
    .map((i) => i.name)
    .filter((name) => matched.has(name.toLowerCase()));
  const matchedProductTypes = products
    .map((p) => p.product_type)
    .filter((name) => matched.has(name.toLowerCase()));

  const seen = new Set<string>();
  const out: ProductEntry[] = [];
  const push = (p: ProductEntry) => {
    if (seen.has(p.product_type) || out.length >= limit) return;
    seen.add(p.product_type);
    out.push(p);
  };

  // Direct product-type mentions first ("show hydrating serum").
  for (const name of matchedProductTypes) {
    const found = products.find(
      (p) => p.product_type.toLowerCase() === name.toLowerCase(),
    );
    if (found) push(found);
  }
  // Then products formulated with the mentioned ingredient(s).
  for (const ing of matchedIngredients) {
    for (const p of products) {
      if (
        p.recommended_ingredients.some(
          (r) => r.toLowerCase() === ing.toLowerCase(),
        )
      ) {
        push(p);
      }
    }
  }
  return out;
}

async function searchOpenverse(
  query: string,
  limit = 4,
): Promise<IngredientImage[]> {
  // Over-fetch then filter client-side: top Openverse hits for ingredient
  // names are Flickr spam + SVG charts, both unusable in <Image>.
  const url =
    `${OPENVERSE_BASE}?q=${encodeURIComponent(query)}` +
    `&page_size=15&filter_dead=true&license_type=all`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Openverse request failed: ${res.status}`);
  const data = await res.json();
  const results: OpenverseResult[] = data?.results ?? [];
  const usable = results.filter((r) => {
    if (typeof r.url !== "string" || !r.url.startsWith("https")) return false;
    const provider = (r.provider || r.source || "").toLowerCase();
    if (BLOCKED_PROVIDERS.has(provider)) return false;
    if (!RENDERABLE_EXT_RE.test(r.url)) return false;
    if (r.title && CHART_TITLE_RE.test(r.title)) return false;
    return true;
  });
  // Wikimedia-hosted files first — upload.wikimedia.org is hotlink-friendly
  // and reliable in React Native; other providers after.
  usable.sort((a, b) => {
    const aWiki = (a.provider || "").toLowerCase().includes("wikimedia")
      ? 0
      : 1;
    const bWiki = (b.provider || "").toLowerCase().includes("wikimedia")
      ? 0
      : 1;
    return aWiki - bWiki;
  });
  return usable.slice(0, limit).map((r, idx) => ({
    id: r.id ?? `openverse-${idx}`,
    title: r.title || query,
    // Prefer the Openverse thumbnail proxy when the direct URL is not a
    // plain raster file — the proxy normalizes hotlink-hostile hosts.
    imageUrl: RENDERABLE_EXT_RE.test(r.url as string)
      ? (r.url as string)
      : r.thumbnail || (r.url as string),
    sourceUrl: r.foreign_landing_url || (r.url as string),
    sourceName: r.provider || "Openverse",
  }));
}

async function searchWikimedia(
  query: string,
  limit = 4,
): Promise<IngredientImage[]> {
  // Step 1: search for matching page titles.
  const searchUrl =
    `https://en.wikipedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(query)}&srlimit=${limit}` +
    `&format=json&origin=*`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`Wikimedia search failed`);
  const searchData = await searchRes.json();
  const titles: string[] = (searchData?.query?.search ?? [])
    .map((s: { title?: string }) => s.title)
    .filter(Boolean)
    .slice(0, limit);
  if (titles.length === 0) return [];

  // Step 2: fetch page images + full URLs for attribution.
  const infoUrl =
    `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages|info` +
    `&titles=${encodeURIComponent(titles.join("|"))}` +
    `&pithumbsize=500&inprop=url&format=json&origin=*`;
  const infoRes = await fetch(infoUrl);
  if (!infoRes.ok) throw new Error(`Wikimedia info failed`);
  const infoData = await infoRes.json();
  const pages = Object.values(
    (infoData?.query?.pages ?? {}) as Record<
      string,
      {
        title?: string;
        thumbnail?: { source?: string };
        fullurl?: string;
      }
    >,
  );
  return pages
    .filter((p) => p.thumbnail?.source)
    .map((p, idx) => ({
      id: `wiki-${idx}`,
      title: p.title || query,
      imageUrl: p.thumbnail!.source as string,
      sourceUrl: p.fullurl || "https://en.wikipedia.org",
      sourceName: "Wikipedia",
    }));
}

/**
 * Pexels — primary provider. images.pexels.com is a hotlink-friendly CDN
 * with pre-sized variants, unlike Wikimedia/Openverse hosts that often
 * fail inside React Native <Image>. Free key, no card:
 * https://www.pexels.com/api/ -> EXPO_PUBLIC_PEXELS_API_KEY.
 * Returns [] when no key is configured so the chain falls through.
 */
type PexelsPhoto = {
  id?: number;
  alt?: string | null;
  photographer?: string;
  url?: string;
  src?: { medium?: string; small?: string; tiny?: string };
};

async function searchPexels(
  query: string,
  limit = 4,
): Promise<IngredientImage[]> {
  if (!PEXELS_API_KEY) return [];
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&per_page=${limit}&orientation=landscape&size=medium`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_API_KEY } });
  if (!res.ok) throw new Error(`Pexels request failed: ${res.status}`);
  const data = await res.json();
  const photos: PexelsPhoto[] = data?.photos ?? [];
  return photos
    .filter((p) => typeof p.src?.medium === "string")
    .slice(0, limit)
    .map((p) => ({
      id: `pexels-${p.id ?? Math.random()}`,
      title: p.alt || query,
      imageUrl: p.src!.medium as string,
      sourceUrl: p.url || "https://www.pexels.com",
      sourceName: p.photographer ? `Pexels • ${p.photographer}` : "Pexels",
    }));
}

/**
 * Find live images for an ingredient / product query.
 * Pexels CDN first (actually renders in <Image>), then Wikimedia
 * pageimages, then filtered Openverse (Flickr + SVG charts excluded).
 * Never throws — returns [] when offline or when providers fail, so the
 * chatbot can still reply with text.
 */
export async function findIngredientImages(
  message: string,
  limit = 4,
): Promise<IngredientImage[]> {
  // Query straight from the knowledge match — no separate extraction pass.
  const query = findKnownNames(message)[0] ?? cleanFallbackQuery(message);
  if (!query) return [];
  const [pexels, wiki, open] = await Promise.all([
    searchPexels(query, limit).catch((err) => {
      console.warn("Pexels lookup failed:", err);
      return [] as IngredientImage[];
    }),
    searchWikimedia(query, limit).catch(() => [] as IngredientImage[]),
    searchOpenverse(query, limit).catch((err) => {
      console.warn("Openverse lookup failed:", err);
      return [] as IngredientImage[];
    }),
  ]);
  const merged = [...pexels, ...wiki, ...open];
  const seen = new Set<string>();
  return merged
    .filter((img) => {
      if (seen.has(img.imageUrl)) return false;
      seen.add(img.imageUrl);
      return true;
    })
    .slice(0, limit);
}

export function formatImagesForChat(images: IngredientImage[]): string {
  if (images.length === 0) return "";
  return (
    `Here ${images.length > 1 ? "are" : "is"} the ${images.length} ` +
    `image${images.length > 1 ? "s" : ""} I found below. ` +
    `Tap any image to open its source page.`
  );
}
