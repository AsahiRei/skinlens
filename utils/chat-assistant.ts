import type { ChatClinic, ChatTurn, ChatUserContext } from "@/types/chat";
import type { PhProduct } from "@/types/knowledge";

import { getLlamaContext, runExclusive } from "./llama";
import { formatKnowledgeForPrompt } from "./knowledge";
import { stripThinkTags } from "./llm-helpers";
import {
  isSkincareProductQuery,
  searchPhilippinesSkincare,
  formatSearchResultsForPrompt,
} from "./web-search";
import type { ProductCard } from "./web-search";
import {
  findNearbyClinicsForChat,
  formatClinicsReply,
  isNearbyClinicIntent,
} from "./nearby-derma";
import { detectRedFlag } from "./red-flags";
import {
  extractIngredientNames,
  findPhProducts,
  formatPhProductsForPrompt,
  isPhProductIntent,
  PH_PRICE_NOTE,
  resolveSuggestedIngredients,
} from "./ph-products";

const BASE_SYSTEM_PROMPT = `You are SkinLens AI, a friendly skincare assistant.
Your goal is to provide short, helpful, and encouraging advice.

### CONSTRAINTS:
- LENGTH: 2-4 sentences maximum.
- SAFETY: Do not diagnose conditions or recommend prescription meds.
- ESCALATION: Advise a dermatologist for serious/persistent concerns.
- FORMAT: Plain text only. No Markdown, no bolding, no lists, no code fences.
- TONE: Warm and encouraging, not clinical.
- HISTORY: The conversation history is provided. If the user sends a short follow-up (e.g. "what about the evening?"), use the history to answer.
- PERSONAL QUESTIONS: When the user asks about themselves (name, age, skin type, health score, etc.), use the facts in the USER PROFILE section below. State the value plainly.
- PERSONALIZATION: Weave in the user's profile (skin type, concerns) where relevant to make advice more personal.
- PROGRESS: When advising, consider the user's progress (score trend, routine consistency). Praise improvement; if the score is declining, gently suggest checking the routine or seeing a dermatologist.
- AVOID: Never suggest an ingredient listed under "Ingredients to avoid".
- PHILIPPINES: The user is in the Philippines. When recommending products, prefer the PHILIPPINE PRODUCT EXAMPLES if given.
- MISSING DATA: If a fact is missing from the USER PROFILE, say you don't have it yet and suggest completing their profile or taking a scan. Do not invent values.

### EXAMPLE RESPONSES:
User: "What is hyaluronic acid?"
AI: "Hyaluronic acid is a great ingredient that helps your skin hold onto moisture, making it look plump and hydrated. It's generally safe for all skin types and works well in the morning and evening!"

User: "My skin is peeling."
AI: "I'm sorry to hear your skin is feeling that way. It could be due to dryness or a reaction to a product. If it continues or feels painful, it's best to check in with a dermatologist to be safe."`;

export const CHAT_ERROR_REPLY =
  "Sorry, I ran into a problem answering that. Please try again.";

function hasAnyProfileData(ctx: ChatUserContext): boolean {
  return (
    ctx.first_name != null ||
    ctx.age != null ||
    ctx.gender != null ||
    ctx.skin_type != null ||
    ctx.main_concerns != null ||
    ctx.healthscore != null ||
    ctx.last_diagnosis != null ||
    ctx.detection_label != null ||
    ctx.severity != null ||
    ctx.sleep_quality != null ||
    ctx.water_intake != null ||
    ctx.stress_level != null ||
    ctx.routine_summary != null ||
    ctx.recommendations_summary != null ||
    ctx.sensitivity_triggers != null ||
    ctx.progress_summary != null
  );
}

function buildContextBlock(ctx?: ChatUserContext): string {
  if (!ctx || !hasAnyProfileData(ctx)) return "";
  const lines: string[] = [];
  if (ctx.first_name) lines.push(`Name: ${ctx.first_name}`);
  if (ctx.age) lines.push(`Age: ${ctx.age}`);
  if (ctx.gender) lines.push(`Gender: ${ctx.gender}`);
  if (ctx.skin_type) lines.push(`Skin type: ${ctx.skin_type}`);
  if (ctx.main_concerns) lines.push(`Main concerns: ${ctx.main_concerns}`);
  if (ctx.healthscore != null)
    lines.push(`Latest skin health score: ${Math.round(ctx.healthscore)} out of 100`);
  if (ctx.detection_label) lines.push(`Last scan finding: ${ctx.detection_label}`);
  if (ctx.severity) lines.push(`Last scan severity: ${ctx.severity}`);
  if (ctx.last_diagnosis) lines.push(`Last scan details: ${ctx.last_diagnosis}`);
  if (ctx.sleep_quality) lines.push(`Sleep quality: ${ctx.sleep_quality}`);
  if (ctx.water_intake) lines.push(`Water intake: ${ctx.water_intake}`);
  if (ctx.stress_level) lines.push(`Stress level: ${ctx.stress_level}`);
  if (ctx.routine_summary)
    lines.push(`Current routine: ${ctx.routine_summary}`);
  if (ctx.recommendations_summary)
    lines.push(`Recommended products: ${ctx.recommendations_summary}`);
  if (ctx.sensitivity_triggers)
    lines.push(`Known sensitivity triggers (from logged flare-ups): ${ctx.sensitivity_triggers}`);
  if (ctx.progress_summary) lines.push(`Progress: ${ctx.progress_summary}`);
  if (ctx.doctor_review)
    lines.push(
      `Dermatologist review of latest scan: ${ctx.doctor_review}${ctx.doctor_notes ? ` (notes: ${ctx.doctor_notes.slice(0, 160)})` : ""}`,
    );
  if (ctx.avoid_ingredients && ctx.avoid_ingredients.length > 0)
    lines.push(`Ingredients to avoid (linked to past flare-ups): ${ctx.avoid_ingredients.join(", ")}`);
  if (lines.length === 0) return "";
  return `\n\nUSER PROFILE — facts about this user. Use them to answer questions about the user, and to personalize skincare advice:\n${lines.join("\n")}`;
}

function missing(fieldLabel: string): string {
  return `I don't have your ${fieldLabel} on file yet. Try completing your profile or taking a skin scan, then ask me again.`;
}

/**
 * Progress answer from scan history + routine adherence, with a short
 * personal take on what to do next.
 */
export function describeProgress(ctx: ChatUserContext): string {
  const name = ctx.first_name ? `, ${ctx.first_name}` : "";
  if (!ctx.scan_count) {
    return "You don't have any scans yet, so there's no progress to show. Take a skin scan, then scan again in a week or two and I can tell you how your skin is changing.";
  }
  const parts: string[] = [];
  if (ctx.scan_count === 1) {
    parts.push(
      `You have 1 scan so far${ctx.healthscore != null ? ` with a skin health score of ${Math.round(ctx.healthscore)}` : ""}. Scan again in about a week so I can track your progress.`,
    );
  } else {
    parts.push(`Here's your progress${name}: ${ctx.progress_summary}.`);
  }

  // Personal take on the numbers.
  if (ctx.score_trend === "improving") {
    parts.push("Your skin is improving. What you're doing is working, so keep it consistent.");
  } else if (ctx.score_trend === "declining") {
    parts.push(
      "Your score has dropped lately. Think about any new products or changes in stress or sleep. If it keeps dropping, ask me to find a dermatologist near you.",
    );
  } else if (ctx.score_trend === "steady") {
    parts.push("Your skin is steady. A routine usually shows results after 4 to 6 weeks of consistent use.");
  }
  const days = ctx.routine_days_last_week;
  if (days != null) {
    if (days <= 3) {
      parts.push(`You did your routine on only ${days} of the last 7 days. Doing it every day will help the most.`);
    } else if (days >= 6) {
      parts.push("Your routine consistency is great this week.");
    }
  }
  if (ctx.doctor_review === "confirmed") {
    parts.push("A dermatologist also confirmed your latest scan result.");
  } else if (ctx.doctor_review === "needs_review") {
    parts.push("A dermatologist flagged your latest scan for follow-up, so consider booking a visit.");
  }
  return parts.join(" ");
}

/**
 * Deterministic answers for "about me" questions.
 *
 * The on-device model (Qwen3 0.6B) is too small to reliably follow
 * recall instructions from the system prompt, so self-referential
 * questions are answered directly from the profile. Returns null when
 * the message is not a profile question, letting the LLM handle it.
 */
export function answerProfileQuestion(
  question: string,
  ctx?: ChatUserContext,
): string | null {
  if (!ctx || !hasAnyProfileData(ctx)) {
    // Still intercept self-questions so the tiny model doesn't hallucinate.
    const q = question.toLowerCase();
    const isSelfQuestion =
      /who am i|about me|my (name|age|skin|concern|health|score|scan|result|routine|sleep|water|stress|lifestyle|profile|info|recommendation|progress)/.test(
        q,
      );
    if (isSelfQuestion) {
      return "I don't have your profile information loaded yet. Try completing your profile setup or taking a skin scan first, then ask me again.";
    }
    return null;
  }

  const q = question.toLowerCase();
  const selfRef =
    /\bmy\b/.test(q) ||
    /\bme\b/.test(q) ||
    /\bmine\b/.test(q) ||
    q.includes("i'm") ||
    q.includes("i am") ||
    q.includes("am i") ||
    q.includes("about me") ||
    q.includes("who am i");
  if (!selfRef) return null;

  const has = (...keywords: string[]) => keywords.some((k) => q.includes(k));
  // Advice-seeking questions ("how can I improve my score?", "what should I
  // do about my acne?") fall through to the LLM, which answers with the
  // profile in context — instead of just reciting the fact.
  const adviceIntent = has(
    "recommend",
    "suggest",
    "advice",
    "improve",
    "fix",
    "treat",
    "should",
    "how can",
    "how do",
    "how to",
    "tip",
    "best",
    "good for",
    "help",
  );
  const name = ctx.first_name ? ` ${ctx.first_name}` : "";
  const parts: string[] = [];

  // Full-profile requests: "tell me about myself", "what do you know about me", "my info/profile", "summarize me"
  if (
    /what do you know about me|tell me about|about myself|my (profile|info|information|data|details)|summar.*(me|profile|myself)|who am i/.test(
      q,
    )
  ) {
    if (ctx.first_name) parts.push(`Your name is ${ctx.first_name}`);
    if (ctx.age) parts.push(`You are ${ctx.age} years old`);
    if (ctx.gender) parts.push(`Your gender is ${ctx.gender}`);
    if (ctx.skin_type) parts.push(`Your skin type is ${ctx.skin_type}`);
    if (ctx.main_concerns) parts.push(`Your main concerns are ${ctx.main_concerns}`);
    if (ctx.healthscore != null)
      parts.push(`Your latest skin health score is ${Math.round(ctx.healthscore)} out of 100`);
    if (ctx.detection_label) parts.push(`Your last scan found ${ctx.detection_label}`);
    if (ctx.sleep_quality || ctx.water_intake || ctx.stress_level) {
      const life = [
        ctx.sleep_quality ? `sleep: ${ctx.sleep_quality}` : null,
        ctx.water_intake ? `water: ${ctx.water_intake}` : null,
        ctx.stress_level ? `stress: ${ctx.stress_level}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      parts.push(`Your lifestyle — ${life}`);
    }
    if (ctx.routine_summary) parts.push(`Your routine: ${ctx.routine_summary}`);
    if (ctx.sensitivity_triggers)
      parts.push(`Your logged sensitivity triggers: ${ctx.sensitivity_triggers}`);
    if (ctx.progress_summary) parts.push(`Your progress: ${ctx.progress_summary}`);
    if (parts.length === 0) return missing("profile information");
    return parts.join(". ") + ".";
  }

  if (
    !adviceIntent &&
    (has(
      "progress",
      "improving",
      "getting better",
      "getting worse",
      "trend",
      "doing so far",
      "how am i doing",
      "how's my skin",
      "how is my skin",
    ) ||
      (has("score") && has("change", "compare", "history", "over time", "went")))
  ) {
    return describeProgress(ctx);
  }

  if (has("name", "who am i", "call me")) {
    if (q.includes("name") || q.includes("who am i") || q.includes("call me")) {
      return ctx.first_name
        ? `Your name is ${ctx.first_name}.`
        : missing("name");
    }
  }
  if (has("age", "how old")) {
    return ctx.age ? `You are ${ctx.age} years old.` : missing("age");
  }
  if (has("gender")) {
    return ctx.gender ? `Your gender is ${ctx.gender}.` : missing("gender");
  }
  if (has("skin type", "skin-type", "skintype", "type of skin", "my skin is")) {
    // Only fire for identity questions ("what is my skin type?"), not advice.
    if (!adviceIntent && has("what", "which", "tell", "remind", "know", "type")) {
      // Disambiguate from concern questions mentioning skin too.
      if (!has("concern", "problem", "issue", "condition", "score", "health")) {
        return ctx.skin_type
          ? `Your skin type is ${ctx.skin_type}.`
          : missing("skin type");
      }
    }
  }
  if (
    !adviceIntent &&
    has("concern", "problem", "issue", "condition", "worried", "struggle")
  ) {
    return ctx.main_concerns
      ? `Your main skin concerns are ${ctx.main_concerns}.`
      : missing("skin concerns");
  }
  if (!adviceIntent && has("health", "score", "rating")) {
    return ctx.healthscore != null
      ? `Your latest skin health score is ${Math.round(ctx.healthscore)} out of 100.`
      : missing("skin health score");
  }
  if (
    !adviceIntent &&
    has(
      "diagnos",
      "scan",
      "result",
      "finding",
      "detect",
      "sever",
      "last check",
      "analysis",
    )
  ) {
    const bits: string[] = [];
    if (ctx.detection_label) bits.push(`finding: ${ctx.detection_label}`);
    if (ctx.severity) bits.push(`severity: ${ctx.severity}`);
    if (ctx.last_diagnosis) bits.push(ctx.last_diagnosis);
    if (ctx.healthscore != null)
      bits.push(`health score: ${Math.round(ctx.healthscore)} out of 100`);
    if (bits.length === 0) return missing("scan results");
    return `Here's your latest scan${name ? `,${name}` : ""}: ${bits.join(". ")}.`;
  }
  if (!adviceIntent && has("sleep")) {
    return ctx.sleep_quality
      ? `Your sleep quality is recorded as ${ctx.sleep_quality}.`
      : missing("sleep quality");
  }
  if (!adviceIntent && has("water", "hydrat", "drink")) {
    return ctx.water_intake
      ? `Your water intake is recorded as ${ctx.water_intake}.`
      : missing("water intake");
  }
  if (!adviceIntent && has("stress")) {
    return ctx.stress_level
      ? `Your stress level is recorded as ${ctx.stress_level}.`
      : missing("stress level");
  }
  if (
    !adviceIntent &&
    has("trigger", "flare", "reaktion", "causes my", "what sets off")
  ) {
    return ctx.sensitivity_triggers
      ? `Your logged sensitivity triggers: ${ctx.sensitivity_triggers}.`
      : missing("sensitivity trigger log");
  }
  if (has("lifestyle", "habit", "sleep", "water", "stress") && has("lifestyle", "habit", "all", "every")) {
    const bits = [
      ctx.sleep_quality ? `sleep: ${ctx.sleep_quality}` : null,
      ctx.water_intake ? `water: ${ctx.water_intake}` : null,
      ctx.stress_level ? `stress: ${ctx.stress_level}` : null,
    ].filter(Boolean);
    if (bits.length === 0) return missing("lifestyle information");
    return `Your lifestyle: ${bits.join(", ")}.`;
  }
  if (
    !adviceIntent &&
    has("routine", "regimen", "morning", "evening", "afternoon", "steps", "products i use")
  ) {
    return ctx.routine_summary
      ? `Your current routine: ${ctx.routine_summary}`
      : missing("routine");
  }
  if (has("recommend", "suggest", "product for me", "should i use", "my products")) {
    // Only intercept when asking about THEIR recommendations, not general advice.
    // Skip if user clearly wants to buy/shop online — let web search handle it.
    const wantsOnlineShopping =
      /\b(online|shop|store|buy|lazada|shopee|watsons|website|where to|find)\b/i.test(q);
    if (!wantsOnlineShopping && (/\bmy\b|\bme\b|\bmine\b|\bfor me\b/.test(q))) {
      return ctx.recommendations_summary
        ? `Based on your last scan, recommended products for you: ${ctx.recommendations_summary}`
        : ctx.main_concerns || ctx.skin_type
        ? null // fall through to the LLM for personalized general advice
        : missing("product recommendations");
    }
  }

  return null;
}

/**
 * Keep the most recent turns that fit a character budget.
 *
 * The model's whole context is 2048 tokens shared with the system prompt
 * (profile + knowledge ≈ 600-900 tokens) and the reply. A fixed turn count
 * can overflow it on chatty users; a budget keeps prefill in bounds while
 * always retaining the latest exchange so the reply has the question.
 */
const MAX_HISTORY_CHARS = 2400;

function trimHistoryForPrompt(history: ChatTurn[]): ChatTurn[] {
  const clean = history.filter((t) => t.content !== CHAT_ERROR_REPLY);
  const turns: ChatTurn[] = [];
  let used = 0;
  for (let i = clean.length - 1; i >= 0; i--) {
    const turn = clean[i];
    const cost = turn.content.length + 16;
    if (turns.length >= 2 && used + cost > MAX_HISTORY_CHARS) break;
    turns.push(turn);
    used += cost;
  }
  return turns.reverse();
}

export type ChatReply = {
  text: string;
  productCards?: ProductCard[];
  /** Curated product examples sold in the Philippines. */
  phProducts?: PhProduct[];
  /** Nearby / verified dermatology clinics. */
  clinics?: ChatClinic[];
};

/**
 * Check if we should do a web search for this query
 */
function shouldWebSearch(message: string, userContext?: ChatUserContext): boolean {
  // If user clearly wants to buy/shop online, always trigger web search
  // regardless of profile question fast-path.
  const lower = message.toLowerCase();
  const wantsOnlineShopping =
    /\b(online|shop|store|buy|lazada|shopee|watsons|website|where to|find|based on your suggestion|based on your recommendation|based on what you said|give me products|show me products)\b/i.test(
      lower,
    );
  if (wantsOnlineShopping) return true;

  // Already handled by profile questions
  if (userContext && answerProfileQuestion(message, userContext)) {
    return false;
  }
  // Check for product/skincare queries that need live PH data
  return isSkincareProductQuery(message);
}

export async function generateChatReply(
  history: ChatTurn[],
  userContext?: ChatUserContext,
  onModelDownloadProgress?: (fraction: number) => void,
): Promise<ChatReply> {
  // Fast path: answer "about me" questions deterministically without
  // loading the model — guarantees correct recall on the tiny on-device LLM.
  const lastUserMessage = [...history].reverse().find((t) => t.role === "user");

  // Safety first: emergencies, skin-cancer/infection warning signs and
  // self-harm get a fixed, reviewed reply. Never left to the small LLM.
  const redFlag = lastUserMessage ? detectRedFlag(lastUserMessage.content) : null;
  if (redFlag) return { text: redFlag.reply };

  // Nearby dermatologist: location + places lookup, no LLM needed.
  if (lastUserMessage && isNearbyClinicIntent(lastUserMessage.content)) {
    const result = await findNearbyClinicsForChat(5);
    return {
      text: formatClinicsReply(result, userContext),
      clinics: result.clinics.length > 0 ? result.clinics : undefined,
    };
  }

  if (lastUserMessage && userContext) {
    const direct = answerProfileQuestion(
      lastUserMessage.content,
      userContext,
    );
    if (direct) {
      // "What products do you recommend for me?" — answer from the scan,
      // then show PH examples for those recommended ingredients.
      if (isPhProductIntent(lastUserMessage.content)) {
        const phProducts = findPhProducts({
          ingredients: resolveSuggestedIngredients(lastUserMessage.content, history, userContext),
          message: lastUserMessage.content,
          ctx: userContext,
        });
        if (phProducts.length > 0) {
          return {
            text: `${direct}\n\nSample products sold in the Philippines are below. ${PH_PRICE_NOTE}`,
            phProducts,
          };
        }
      }
      return { text: direct };
    }
  }

  // Check if we need web search for Philippines product info
  const userQuery = lastUserMessage?.content ?? "";
  const doWebSearch = shouldWebSearch(userQuery, userContext);

  // Curated Philippine product examples for the suggested ingredients.
  const wantsPhProducts = isPhProductIntent(userQuery);
  let phProducts: PhProduct[] = wantsPhProducts
    ? findPhProducts({
        ingredients: resolveSuggestedIngredients(userQuery, history, userContext),
        message: userQuery,
        ctx: userContext,
      })
    : [];

  let searchResultsText = "";
  let productCards: ProductCard[] = [];

  if (doWebSearch) {
    try {
      const searchResult = await searchPhilippinesSkincare(userQuery, userContext, history);
      // Curated examples are more reliable than scraped titles; keep the
      // web text short when we already have them (2048-token context).
      searchResultsText = formatSearchResultsForPrompt(
        phProducts.length > 0 ? searchResult.textResults.slice(0, 2) : searchResult.textResults,
      );
      productCards = phProducts.length > 0 ? [] : searchResult.productCards;
    } catch (error) {
      console.warn("Web search failed, continuing without it:", error);
    }
  }

  const context = await getLlamaContext(onModelDownloadProgress);
  const knowledgeBlock = formatKnowledgeForPrompt(
    userContext?.skin_type ?? userContext?.main_concerns ?? "normal",
    userContext?.main_concerns ?? undefined,
    userQuery,
  );

  // Build system prompt with optional web search results
  const systemPromptParts = [
    BASE_SYSTEM_PROMPT,
    buildContextBlock(userContext),
  ];

  if (knowledgeBlock) {
    systemPromptParts.push(`\n\nDERMATOLOGIST KNOWLEDGE (use when relevant to the user's question):\n${knowledgeBlock}`);
  }

  if (phProducts.length > 0) {
    systemPromptParts.push(`\n\n${formatPhProductsForPrompt(phProducts)}`);
    systemPromptParts.push(
      "\n\nName one or two of these products in your reply and say why they fit the user. Do not invent prices.",
    );
  }

  if (searchResultsText) {
    systemPromptParts.push(`\n\n${searchResultsText}`);
    systemPromptParts.push(
      "\n\nUse the web search results above to recommend specific products available in the Philippines. Mention retailer names (Lazada, Shopee, Watsons, BeautyMNL, etc.) when helpful. Keep responses to 2-4 sentences."
    );
  }

  const systemPrompt = systemPromptParts.join("");

  const trimmedHistory = trimHistoryForPrompt(history);
  const { text } = await runExclusive(() =>
    context.completion({
      messages: [
        { role: "system", content: systemPrompt },
        ...trimmedHistory.map((turn) => ({ role: turn.role, content: turn.content })),
      ],
      n_predict: 512,
      temperature: 0.4,
      top_p: 0.9,
      stop: ["\n\n", "<|eot_id|>", "<|end_of_text|>"],
      chat_template_kwargs: { enable_thinking: false },
    }),
  );

  let reply = stripThinkTags(text);

  // The reply itself may suggest ingredients ("try niacinamide...") for a
  // product question that had none to start with: show examples for those.
  if (wantsPhProducts && phProducts.length === 0) {
    phProducts = findPhProducts({
      ingredients: extractIngredientNames(reply),
      message: userQuery,
      ctx: userContext,
    });
    if (phProducts.length > 0) productCards = [];
  }
  if (phProducts.length > 0) {
    reply = `${reply}\n\nSample products sold in the Philippines are below. ${PH_PRICE_NOTE}`;
  }

  return {
    text: reply,
    productCards: productCards.length > 0 ? productCards : undefined,
    phProducts: phProducts.length > 0 ? phProducts : undefined,
  };
}

export { preloadLlama, releaseLlama } from "./llama";