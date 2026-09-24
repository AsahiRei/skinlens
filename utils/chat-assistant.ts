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
- Use the USER CONTEXT below to personalize answers (e.g. reference their skin type, current concern, or routine) when it's relevant, but don't recite it back verbatim unless asked.`;

function buildContextBlock(ctx?: ChatUserContext): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.first_name) lines.push(`Name: ${ctx.first_name}`);
  if (ctx.skin_type) lines.push(`Skin type: ${ctx.skin_type}`);
  if (ctx.main_concerns) lines.push(`Main concern: ${ctx.main_concerns}`);
  if (ctx.healthscore != null)
    lines.push(`Current skin health score: ${ctx.healthscore}%`);
  if (ctx.sleep_quality) lines.push(`Sleep quality: ${ctx.sleep_quality}`);
  if (ctx.water_intake) lines.push(`Water intake: ${ctx.water_intake}`);
  if (ctx.stress_level) lines.push(`Stress level: ${ctx.stress_level}`);
  if (ctx.routine_summary)
    lines.push(`Current routine summary: ${ctx.routine_summary}`);
  if (lines.length === 0) return "";
  return `\n\nUSER CONTEXT (private, do not repeat verbatim unless asked):\n${lines.join("\n")}`;
}

export async function generateChatReply(
  history: ChatTurn[],
  userContext?: ChatUserContext,
  onModelDownloadProgress?: (fraction: number) => void,
): Promise<string> {
  const context = await getLlamaContext(onModelDownloadProgress);
  const knowledgeBlock = formatKnowledgeForPrompt(
    userContext?.main_concerns ?? "normal",
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
