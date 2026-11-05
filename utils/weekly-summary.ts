import type { Result } from "@/types/schema";
import { getLlamaContext, runExclusive } from "./llama";
import { stripThinkTags } from "./llm-helpers";
import { formatter } from "./formatter";

const SYSTEM_PROMPT = `You are a friendly skincare assistant. Your goal is to summarize the user's skin progress for the week based on their scan data.

Guidelines:
- Be friendly but factual: describe what the data shows, without advice, encouragement, or predictions.
- Keep it concise (1-2 sentences).
- Use plain text only — no Markdown, no bullet points, no emoji.
- State the facts clearly (scores, changes, and findings) but weave them into a natural, friendly summary.
- Do not diagnose conditions or recommend specific prescription medications.
- Respond in English only.`;

function buildFacts(results: Result[]) {
  const byDate = [...results].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const latest = byDate[byDate.length - 1];
  const earliest = byDate[0];
  const avg = Math.round(
    byDate.reduce((sum, r) => sum + r.healthscore, 0) / byDate.length,
  );

  const counts = new Map<string, number>();
  for (const r of results) {
    const label = r.detection_label ?? r.severity;
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const findings = [...counts.entries()].map(
    ([label, count]) =>
      `${formatter(label)} (${count} scan${count === 1 ? "" : "s"})`,
  );

  const lines: string[] = [
    `Scans this week: ${results.length}`,
    `Latest skin health score: ${latest.healthscore} out of 100`,
    `Average skin health score this week: ${avg} out of 100`,
  ];

  if (results.length >= 2) {
    const delta = latest.healthscore - earliest.healthscore;
    const direction =
      delta > 0 ? "improving" : delta < 0 ? "declining" : "steady";
    lines.push(
      `Score change since the first scan this week: ${delta > 0 ? "+" : ""}${delta} points (${direction})`,
    );
  } else {
    lines.push("Score change since the first scan this week: no earlier scan to compare against");
  }

  lines.push(`Findings recorded: ${findings.length > 0 ? findings.join(", ") : "none"}`);

  const latestLabel = latest.detection_label ?? latest.severity;
  if (latestLabel) {
    lines.push(`Most recent finding: ${formatter(latestLabel)}`);
  }

  return { avg, latestScore: latest.healthscore, facts: lines.join("\n") };
}

function cleanText(text: string): string {
  return text
    .replace(/^[ \t]*[-•][ \t]+/gm, "")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*(?:weekly\s+)?(?:summary|progress|update)\s*:\s*/i, "")
    .replace(/[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF\u2700-\u27BF\uFE0F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  for (const line of text.split("\n")) {
    const matches = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    for (const match of matches) {
      if (match.trim()) sentences.push(match);
    }
  }
  return sentences;
}

// Word-bounded so e.g. "great" doesn't match "eat" or "entry" match "try".
const ADVISORY_PATTERN =
  /\b(suggest\w*|recommend\w*|try|trying|should|could|consider\w*|please|drink\w*|eat|eating|sleep\w*|exercis\w*|visit\w*|doctors?|dermatologists?|consult\w*|creams?|ointments?|lotions?|serums?|wash\w*|cleans\w*)\b/i;

function isAdvisory(sentence: string): boolean {
  if (sentence.trim().endsWith("?")) return true;
  return ADVISORY_PATTERN.test(sentence);
}

// Keep at most two factual sentences; drop questions and advice-like ones.
function buildSummaryText(raw: string): string {
  const cleaned = cleanText(stripThinkTags(raw));
  if (!cleaned) return "";

  return splitSentences(cleaned)
    .map((s) => s.trim())
    .filter((s) => s && !isAdvisory(s))
    .slice(0, 2)
    .join(" ")
    .trim();
}

// Single-entry cache so revisiting the Progress screen doesn't re-run the
// on-device model when the week's scans are unchanged.
let cache: { key: string; summary: string } | null = null;

function cacheKey(results: Result[]): string {
  return results
    .map((r) => `${r.id}:${r.healthscore}:${r.detection_label ?? r.severity ?? ""}`)
    .sort()
    .join("|");
}

export function getCachedWeeklySummary(results: Result[]): string | null {
  if (results.length === 0 || !cache) return null;
  return cache.key === cacheKey(results) ? cache.summary : null;
}

export async function generateWeeklySummary(
  results: Result[],
  onModelDownloadProgress?: (fraction: number) => void,
): Promise<string> {
  if (results.length === 0) return "No scans this week. Start scanning to track your skin health!";

  const { avg, latestScore, facts } = buildFacts(results);

  const context = await getLlamaContext(onModelDownloadProgress);
  const { text } = await runExclusive(() =>
    context.completion({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Scan data for this week:\n${facts}\n\nDescribe the user's current skin progress in 1-2 sentences, stating only what this data shows. No advice, no encouragement, no predictions.`,
        },
      ],
      n_predict: 128,
      temperature: 0.4,
      top_p: 0.9,
      stop: ["</s>", "<|eot_id|>", "<|end_of_text|>"],
      chat_template_kwargs: { enable_thinking: false },
    }),
  );

  const summary = buildSummaryText(text);
  if (summary) cache = { key: cacheKey(results), summary };

  return (
    summary ||
    `This week: ${results.length} scans, average score ${avg}/100, latest score ${latestScore}/100.`
  );
}
