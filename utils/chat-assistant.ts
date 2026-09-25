import type { ChatTurn, ChatUserContext } from "@/types/chat";

import { getLlamaContext, runExclusive } from "./llama";
import { formatKnowledgeForPrompt } from "./knowledge";
import { stripThinkTags } from "./llm-helpers";

const BASE_SYSTEM_PROMPT = `You are SkinLens AI, a friendly and knowledgeable skincare assistant embedded in the SkinLens app. You answer questions about skincare routines, ingredients, and general skin health.

Guidelines:
- Keep answers short, clear, and easy to understand (2-4 sentences unless the user asks for more detail).
- Do not diagnose skin conditions or claim to cure them.
- Do not recommend prescription medications.
- If a concern sounds serious or persistent, advise the user to consult a dermatologist.
- Be warm and encouraging, not clinical.
- Respond in plain text only — no Markdown, no code fences.
- NEARBY CLINICS: you do NOT know live locations. Never invent hospital names, addresses, or distances. If the user asks for nearby hospitals/clinics/dermatologists, say the app will look them up with their location and suggest opening the Derma tab — the app layer handles the real lookup separately.
- PERSONAL QUESTIONS: when the user asks about themselves (their name, age, skin type, concerns, health score, last scan, lifestyle, routine, recommendations), answer directly using the facts in USER PROFILE below. State the value plainly, e.g. "Your skin type is oily." Never say you don't have access to their information when it is listed below.
- PERSONALIZATION: when answering general skincare questions, weave in their profile (skin type, concerns, lifestyle) where relevant.
- If a requested fact is missing from USER PROFILE, say you don't have it yet and suggest completing their profile or taking a skin scan. Do not invent values.`;

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
    ctx.recommendations_summary != null
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
  if (lines.length === 0) return "";
  return `\n\nUSER PROFILE — facts about this user. Use them to answer questions about the user, and to personalize skincare advice:\n${lines.join("\n")}`;
}

function missing(fieldLabel: string): string {
  return `I don't have your ${fieldLabel} on file yet. Try completing your profile or taking a skin scan, then ask me again.`;
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
      /who am i|about me|my (name|age|skin|concern|health|score|scan|result|routine|sleep|water|stress|lifestyle|profile|info|recommendation)/.test(
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
    if (parts.length === 0) return missing("profile information");
    return parts.join(". ") + ".";
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
    if (/\bmy\b|\bme\b|\bmine\b|\bfor me\b/.test(q)) {
      return ctx.recommendations_summary
        ? `Based on your last scan, recommended products for you: ${ctx.recommendations_summary}`
        : ctx.main_concerns || ctx.skin_type
          ? null // fall through to the LLM for personalized general advice
          : missing("product recommendations");
    }
  }

  return null;
}

export async function generateChatReply(
  history: ChatTurn[],
  userContext?: ChatUserContext,
  onModelDownloadProgress?: (fraction: number) => void,
): Promise<string> {
  // Fast path: answer "about me" questions deterministically without
  // loading the model — guarantees correct recall on the tiny on-device LLM.
  const lastUserMessage = [...history].reverse().find((t) => t.role === "user");
  if (lastUserMessage && userContext) {
    const direct = answerProfileQuestion(
      lastUserMessage.content,
      userContext,
    );
    if (direct) return direct;
  }

  const context = await getLlamaContext(onModelDownloadProgress);
  const knowledgeBlock = formatKnowledgeForPrompt(
    userContext?.skin_type ?? userContext?.main_concerns ?? "normal",
    userContext?.main_concerns ?? undefined,
  );
  const systemPrompt =
    BASE_SYSTEM_PROMPT +
    buildContextBlock(userContext) +
    (knowledgeBlock
      ? `\n\nDERMATOLOGIST KNOWLEDGE (use when relevant to the user's question):\n${knowledgeBlock}`
      : "");
  const maxHistoryTurns = 10;
  const trimmedHistory =
    history.length > maxHistoryTurns
      ? history.slice(history.length - maxHistoryTurns)
      : history;
  const { text } = await runExclusive(() =>
    context.completion({
      messages: [
        { role: "system", content: systemPrompt },
        ...trimmedHistory.map((turn) => ({ role: turn.role, content: turn.content })),
      ],
      n_predict: 512,
      temperature: 0.6,
      top_p: 0.9,
      stop: ["</s>", "<|eot_id|>", "<|end_of_text|>"],
      chat_template_kwargs: { enable_thinking: false },
    }),
  );
  return stripThinkTags(text);
}

export { preloadLlama, releaseLlama } from "./llama";
