import type { Result } from "@/types/schema";
import { getLlamaContext, stripThinkingTags } from "./llama";

export async function generateWeeklySummary(
  results: Result[],
  onModelDownloadProgress?: (fraction: number) => void,
): Promise<string> {
  if (results.length === 0) return "No scans this week. Start scanning to track your skin health!";

  const scores = results.map((r) => r.healthscore);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const latest = results[results.length - 1];
  const earliest = results[0];

  const labels = results
    .map((r) => r.detection_label ?? r.severity)
    .filter(Boolean);
  const uniqueLabels = [...new Set(labels)];

  const trend =
    results.length >= 2
      ? latest.healthscore - earliest.healthscore
      : 0;

  const context = await getLlamaContext(onModelDownloadProgress);
  const { text } = await context.completion({
    messages: [
      {
        role: "system",
        content: `You are a skincare assistant. Write a very short 1-2 sentence summary of the user's weekly skin scan results. Be warm and encouraging. Do not use markdown.`,
      },
      {
        role: "user",
        content: `This week's scan data: ${results.length} scans, average health score ${avg}%, trend ${trend > 5 ? "improving" : trend < -5 ? "declining" : "stable"}, detected conditions: ${uniqueLabels.length > 0 ? uniqueLabels.join(", ") : "none"}. Write a short friendly summary.`,
      },
    ],
    n_predict: 128,
    temperature: 0.7,
    top_p: 0.9,
    stop: ["</s>", "<|eot_id|>", "<|end_of_text|>"],
  });

  return stripThinkingTags(text) || `You scanned ${results.length} times this week with an average score of ${avg}%.`;
}
