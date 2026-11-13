import { EVIDENCE_LABEL, evidenceFor } from "@/data/derm-validation";
import type { ChatTurn, ChatUserContext } from "@/types/chat";
import { extractIngredientNames } from "@/utils/ph-products";

/**
 * "Is niacinamide proven?", "what's your source?", "is tea tree oil dermatologist-approved?"
 * These are answered from the verified evidence dataset (data/derm-validation.json), never by the
 * on-device LLM — a small model asked for sources will invent citations.
 */
const EVIDENCE_WORDS =
  /\b(evidence|proven|proof|sources?|stud(y|ies)|research|scientific(ally)?|science|backed|legit|clinically|clinical trials?|fda|guidelines?|validated|reliable|trustworthy|citation|references?|meta-analysis)\b|dermatologists? (recommend|approve|endorse)|derma[- ]?(approved|recommended)|does (it|this|that|\w+( \w+)?) (really |actually )?work|(is|are) (it|this|that|they|\w+( \w+)?) (really |actually )?effective|how do you know|where did you get/;

/** Follow-ups that refer back to the previous answer ("what's the source for that?"). */
const BACK_REFERENCE = /\b(that|this|it|those|these|them)\b|how do you know|where did you get/;

/** Knowledge-base ingredients (with an evidence record) named in the text. */
function evidenceIngredients(text: string): string[] {
  return extractIngredientNames(text).filter((n) => !!evidenceFor(n));
}

export function isEvidenceQuestion(message: string): boolean {
  return EVIDENCE_WORDS.test(message.toLowerCase());
}

/**
 * Which ingredients an evidence question is about: those named in it, else (for "what's the
 * source for that?") those in the assistant's previous reply. Empty → not an evidence question we
 * can answer from the dataset.
 */
export function ingredientsForEvidenceQuestion(message: string, history: ChatTurn[]): string[] {
  if (!isEvidenceQuestion(message)) return [];
  const named = evidenceIngredients(message);
  if (named.length > 0) return named.slice(0, 4);
  if (!BACK_REFERENCE.test(message.toLowerCase())) return [];
  const lastAssistant = [...history].reverse().find((t) => t.role === "assistant");
  return lastAssistant ? evidenceIngredients(lastAssistant.content).slice(0, 4) : [];
}

function reviewSentence(name: string): string {
  const r = evidenceFor(name)?.review;
  if (!r || r.status === "pending") return "SkinLens's own dermatologist review is still pending.";
  if (r.status === "rejected") return "Our reviewing dermatologist does not support this use.";
  return `Reviewed and ${r.status === "approved" ? "approved" : "approved with changes"} by our dermatologist${r.reviewer ? ` (${r.reviewer})` : ""}.`;
}

/**
 * Plain-text answer (the chat bubble has no markdown). Sources are not pasted as raw URLs — the
 * reply carries the ingredient names so the chat shows a tappable "Evidence & sources" button.
 */
export function formatEvidenceReply(names: string[], ctx?: ChatUserContext): string {
  const avoid = new Set((ctx?.avoid_ingredients ?? []).map((a) => a.toLowerCase()));
  const parts: string[] = [];
  for (const name of names.slice(0, 2)) {
    const v = evidenceFor(name);
    if (!v) continue;
    const personal = avoid.has(name.toLowerCase())
      ? ` Note: ${name} is on your avoid list (from your sensitivity log or safety answers), so we won't recommend it for you.`
      : "";
    parts.push(
      `${name}: ${EVIDENCE_LABEL[v.level].toLowerCase()} level of evidence. ${v.evidence} ${reviewSentence(name)}${personal}`,
    );
  }
  if (names.length > 2) {
    const rest = names
      .slice(2)
      .map((n) => {
        const v = evidenceFor(n);
        return v ? `${n} (${EVIDENCE_LABEL[v.level].toLowerCase()})` : n;
      })
      .join(", ");
    parts.push(`Also asked about: ${rest}.`);
  }
  parts.push(
    `Tap "Evidence & sources" below to open the guidelines and studies. Evidence describes the ingredient in general, not how your skin will react, so patch-test new products.`,
  );
  return parts.join("\n\n");
}
