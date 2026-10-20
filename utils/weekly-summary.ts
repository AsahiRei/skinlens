import type { Result } from "@/types/schema";
import { getLlamaContext, runExclusive } from "./llama";
import { stripThinkTags } from "./llm-helpers";
import { formatter } from "./formatter";

const SYSTEM_PROMPT = `You are a skincare assistant. You report the user's current skin progress using only the scan data you are given.

Rules:
- State only what the data shows right now: the scores, the direction of change, and the findings recorded.
- Do not give advice, tips, product or routine suggestions, or next steps.
- Do not predict what will happen next or guess at causes.
- Do not praise, congratulate, or reassure the user.
- Do not ask the user any questions.
- Never mention a number that is not in the data.
- Reply in 1-2 plain sentences. No Markdown, no bullet points, no emoji.
- Respond in English only.`;

const ADVISORY_PATTERNS: RegExp[] = [
  /\b(?:should|ought to|must)\b/i,
  /\b(?:recommend|advise|advice|suggest|suggestion|tips?|next steps?)\b/i,
  /\b(?:try|consider|apply|switch|avoid|aim|consult)\b/i,
  /\b(?:remember to|make sure|keep it up|keep going|keep up)\b/i,
  /\buse\s+(?:a|an|some|the|your|more|less|products?|serums?|creams?|sunscreen)\b/i,
  /\b(?:will|going to|expected to|likely|probably|in the future|soon)\b/i,
  /\b(?:great|excellent|awesome|amazing|fantastic|wonderful|congratulations|proud)\b/i,
  /^(?:start|try|use|apply|consider|aim|keep|avoid|switch|add|remember|make|consult|choose|pick|follow|stick|reduce|increase|boost|target|monitor)\b/i,
];

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

function isAdvisory(sentence: string): boolean {
  if (sentence.trim().endsWith("?")) return true;
  return ADVISORY_PATTERNS.some((pattern) => pattern.test(sentence));
}

function buildSummaryText(raw: string): string {
  const cleaned = cleanText(stripThinkTags(raw));
  if (!cleaned) return "";

  const sentences = splitSentences(cleaned);
  const descriptive = sentences.filter((s) => !isAdvisory(s));
  if (descriptive.length === 0) return "";

  const last = descriptive[descriptive.length - 1];
  const kept =
    descriptive.length > 1 && !/[.!?]$/.test(last.trim())
      ? descriptive.slice(0, -1)
      : descriptive;

  return kept
    .slice(0, 2)
    .map((s) => s.trim())
    .join(" ")
    .trim();
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
      temperature: 0.3,
      top_p: 0.9,
      stop: ["</s>", "<|eot_id|>", "<|end_of_text|>"],
      chat_template_kwargs: { enable_thinking: false },
    }),
  );

  return (
    buildSummaryText(text) ||
    `This week: ${results.length} scans, average score ${avg}%, latest score ${latestScore}%.`
  );
}
