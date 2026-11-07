import type { ChatUserContext, ChatTurn } from "@/types/chat";

/** Philippines-focused web search utilities. */

const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/";
const SEARCH_TIMEOUT_MS = 8_000;

// Philippine-specific query modifiers for better local results
const PH_SITES = [
  "lazada.com.ph",
  "shopee.ph",
  "watsons.com.ph",
  "beautymnl.com",
  "landers.ph",
  "smer.ph",
  "skinphilosophy.ph",
  "skin101.ph",
  "bareface.ph",
  "theordinary.ph",
  "koreanbeauty.ph",
];

// Skin/beauty related terms that should trigger PH-localized search
const SKINCARE_TERMS = [
  "product",
  "serum",
  "moisturizer",
  "cleanser",
  "sunscreen",
  "toner",
  "cream",
  "mask",
  "exfoliant",
  "essence",
  "oil",
  "treatment",
  "niacinamide",
  "hyaluronic",
  "retinol",
  "vitamin c",
  "salicylic",
  "glycolic",
  "ceramide",
  "peptide",
  "centella",
  "snail mucin",
  "acne",
  "pimple",
  "dark spot",
  "hyperpigmentation",
  "pore",
  "oily skin",
  "dry skin",
  "sensitive skin",
  "combination skin",
];

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type ProductCard = {
  product_type: string;
  recommended_ingredients: string[];
  imageUrl?: string;
  imageSourceUrl?: string;
  imageSourceName?: string;
  sourceUrl: string;
  price?: string;
  retailer?: string;
  concerns: string[]; // Required by ProductWithImage type
};

/** Check if a query is skincare/product related and should use PH-localized search */
export function isSkincareProductQuery(message: string): boolean {
  const lower = message.toLowerCase();
  return SKINCARE_TERMS.some((term) => lower.includes(term));
}

/** Build Philippines-focused search query */
function buildPHQuery(message: string): string {
  const lower = message.toLowerCase();
  const parts: string[] = [message];

  // Add "Philippines" or "PH" if not already present
  if (!lower.includes("philippines") && !lower.includes(" ph ") && !lower.includes("ph ")) {
    parts.push("Philippines");
  }

  // Add retailer sites for product searches
  if (
    lower.includes("buy") ||
    lower.includes("price") ||
    lower.includes("where") ||
    lower.includes("recommend")
  ) {
    parts.push(PH_SITES.slice(0, 3).join(" OR site:"));
  }

  return parts.join(" ");
}

/** Fetch structured results from DuckDuckGo Lite (HTML). */
export async function searchDuckDuckGoLite(query: string, limit = 8): Promise<WebSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    kl: "ph-en", // Philippines English locale
  });

  // Bound the request: on a flaky connection fetch can hang indefinitely,
  // which would freeze the chatbot reply that awaits it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${DDG_LITE_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`DDG request failed: ${response.status}`);
    }

    const html = await response.text();
    return parseDDGLiteResults(html, limit);
  } catch (error) {
    console.warn("DuckDuckGo search failed:", error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Parse DDG Lite HTML table results */
function parseDDGLiteResults(html: string, limit: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  // DDG Lite returns a table with rows: <tr><td>#</td><td><a href="...">title</a><br>snippet<br>url</td></tr>
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tables = html.match(tableRegex);

  if (!tables) return results;

  // The results table is typically the second table
  const resultsTable = tables[1] || tables[0];
  if (!resultsTable) return results;

  // Extract rows
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
  const rows = resultsTable.match(rowRegex);

  if (!rows) return results;

  for (const row of rows) {
    if (results.length >= limit) break;

    // Extract link and title
    const linkMatch = row.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const url = linkMatch[1];
    const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();

    // Extract snippet (text after <br>)
    const snippetMatch = row.match(/<br>\s*([^<]+)/i);
    const snippet = snippetMatch ? snippetMatch[1].trim() : "";

    // Filter out non-PH results for product queries if we want PH-only
    results.push({ title, url, snippet });
  }

  return results;
}

/**
 * Extract potential product information from search results
 * Creates ProductCard objects with PH retailer info
 */
export function extractProductCards(results: WebSearchResult[], message: string): ProductCard[] {
  const cards: ProductCard[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (cards.length >= 4) break;

    // Try to identify retailer from URL
    let retailer = "Web";
    for (const site of PH_SITES) {
      if (result.url.includes(site)) {
        retailer = site.replace(".com.ph", "").replace(".ph", "");
        break;
      }
    }

    // Extract product type from title
    const productType = extractProductType(result.title, message);
    if (!productType) continue;

    // Extract ingredients mentioned
    const ingredients = extractIngredients(result.title + " " + result.snippet);

    // Create a unique key to deduplicate
    const key = productType.toLowerCase() + "-" + retailer.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    cards.push({
      product_type: productType,
      recommended_ingredients: ingredients,
      sourceUrl: result.url,
      retailer,
      concerns: [], // Web search results don't have condition mapping
    });
  }

  return cards;
}

/** Extract product type from title */
function extractProductType(title: string, originalQuery: string): string | null {
  const lower = title.toLowerCase();
  const queryLower = originalQuery.toLowerCase();

  // Common product types
  const types = [
    "serum",
    "moisturizer",
    "cleanser",
    "sunscreen",
    "toner",
    "cream",
    "mask",
    "exfoliant",
    "essence",
    "oil",
    "treatment",
    "ampoule",
    "emulsion",
    "lotion",
    "balm",
    "gel",
  ];

  for (const type of types) {
    if (lower.includes(type)) {
      // Capitalize properly
      return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }

  // Check if query mentions a specific type
  for (const type of types) {
    if (queryLower.includes(type)) {
      return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }

  // Fallback: extract first meaningful words
  const words = title.split(/\s+/).filter((w) => w.length > 2);
  if (words.length >= 2) {
    return words.slice(0, 2).join(" ");
  }

  return null;
}

/** Extract known skincare ingredients from text */
function extractIngredients(text: string): string[] {
  const knownIngredients = [
    "niacinamide",
    "hyaluronic acid",
    "retinol",
    "vitamin c",
    "salicylic acid",
    "glycolic acid",
    "lactic acid",
    "mandelic acid",
    "azelaic acid",
    "ceramide",
    "peptide",
    "centella asiatica",
    "cica",
    "snail mucin",
    "benzoyl peroxide",
    "adapalene",
    "tretinoin",
    "tranexamic acid",
    "alpha arbutin",
    "kojic acid",
    "licorice",
    "green tea",
    "propolis",
    "squalane",
    "rosehip",
    "vitamin e",
    "zinc",
    "sulfur",
  ];

  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const ing of knownIngredients) {
    if (lower.includes(ing)) {
      // Capitalize properly
      const formatted = ing
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      if (!found.includes(formatted)) {
        found.push(formatted);
      }
    }
  }

  return found.slice(0, 5);
}

/**
 * Extract key skincare terms from conversation history for follow-up queries
 * e.g., "give me product in philippines based on your suggestion"
 * → extracts ingredients/products mentioned in previous assistant messages
 */
export function extractContextFromHistory(history: ChatTurn[]): {
  ingredients: string[];
  productTypes: string[];
  concerns: string[];
} {
  const ingredients = new Set<string>();
  const productTypes = new Set<string>();
  const concerns = new Set<string>();

  // Known terms to look for
  const knownIngredients = [
    "niacinamide",
    "hyaluronic acid",
    "retinol",
    "vitamin c",
    "salicylic acid",
    "glycolic acid",
    "lactic acid",
    "mandelic acid",
    "azelaic acid",
    "ceramide",
    "peptide",
    "centella asiatica",
    "cica",
    "snail mucin",
    "benzoyl peroxide",
    "adapalene",
    "tretinoin",
    "tranexamic acid",
    "alpha arbutin",
    "kojic acid",
    "licorice",
    "green tea",
    "propolis",
    "squalane",
    "rosehip",
    "vitamin e",
    "zinc",
    "sulfur",
  ];

  const knownProductTypes = [
    "serum",
    "moisturizer",
    "cleanser",
    "sunscreen",
    "toner",
    "cream",
    "mask",
    "exfoliant",
    "essence",
    "oil",
    "treatment",
    "ampoule",
    "emulsion",
    "lotion",
    "balm",
    "gel",
  ];

  const knownConcerns = [
    "acne",
    "pimple",
    "breakout",
    "blackhead",
    "whitehead",
    "blemish",
    "dark spot",
    "hyperpigmentation",
    "pore",
    "oily",
    "dry",
    "sensitive",
    "combination",
    "redness",
    "irritation",
    "eczema",
    "rosacea",
    "aging",
    "wrinkle",
    "fine line",
    "dull",
    "uneven texture",
  ];

  // Look at last 4 assistant messages for context
  const recentAssistantMessages = history
    .filter((t) => t.role === "assistant")
    .slice(-4)
    .map((t) => t.content.toLowerCase())
    .join(" ");

  if (!recentAssistantMessages) {
    return { ingredients: [], productTypes: [], concerns: [] };
  }

  // Extract ingredients
  for (const ing of knownIngredients) {
    if (recentAssistantMessages.includes(ing)) {
      ingredients.add(ing);
    }
  }

  // Extract product types
  for (const type of knownProductTypes) {
    if (recentAssistantMessages.includes(type)) {
      productTypes.add(type);
    }
  }

  // Extract concerns
  for (const concern of knownConcerns) {
    if (recentAssistantMessages.includes(concern)) {
      concerns.add(concern);
    }
  }

  return {
    ingredients: Array.from(ingredients).slice(0, 3),
    productTypes: Array.from(productTypes).slice(0, 2),
    concerns: Array.from(concerns).slice(0, 2),
  };
}

/** Check if a message is a follow-up query that should use conversation context */
export function isFollowUpQuery(message: string): boolean {
  const lower = message.toLowerCase();
  const followUpPatterns = [
    "based on your suggestion",
    "based on what you said",
    "based on that",
    "from your recommendation",
    "from your suggestions",
    "what you recommended",
    "what you suggested",
    "those products",
    "those ingredients",
    "the products you mentioned",
    "the ingredients you mentioned",
    "give me products",
    "show me products",
    "find products",
    "where to buy",
    "where can i buy",
    "philippines",
    "ph ",
    "lazada",
    "shopee",
    "watsons",
    "beautymnl",
  ];

  return followUpPatterns.some((pattern) => lower.includes(pattern));
}

/** Build an enhanced query using conversation context */
function buildContextualQuery(
  message: string,
  context: { ingredients: string[]; productTypes: string[]; concerns: string[] },
): string {
  const parts: string[] = [message];

  // Add context from previous conversation
  if (context.ingredients.length > 0) {
    parts.push(context.ingredients.join(" "));
  }
  if (context.productTypes.length > 0) {
    parts.push(context.productTypes.join(" "));
  }
  if (context.concerns.length > 0) {
    parts.push(context.concerns.join(" "));
  }

  return parts.join(" ");
}

/**
 * Main search entry point used by the chatbot: returns text results + product cards.
 */
export async function searchPhilippinesSkincare(
  message: string,
  userContext?: ChatUserContext,
  history?: ChatTurn[],
): Promise<{
  textResults: WebSearchResult[];
  productCards: ProductCard[];
  searchQuery: string;
}> {
  // Check if this is a follow-up query that needs conversation context
  let query: string;
  if (history && isFollowUpQuery(message)) {
    const context = extractContextFromHistory(history);
    const contextualMessage = buildContextualQuery(message, context);
    query = buildPHQuery(contextualMessage);
  } else {
    query = buildPHQuery(message);
  }

  // Fetch results
  const textResults = await searchDuckDuckGoLite(query, 8);

  // Extract product cards
  const productCards = extractProductCards(textResults, message);

  return { textResults, productCards, searchQuery: query };
}

/** Format text results for LLM context */
export function formatSearchResultsForPrompt(results: WebSearchResult[]): string {
  if (results.length === 0) return "";

  const lines = ["WEB SEARCH RESULTS (Philippines):"];
  for (let i = 0; i < Math.min(results.length, 5); i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.snippet}`);
    lines.push(`   Source: ${r.url}`);
  }
  return lines.join("\n");
}
