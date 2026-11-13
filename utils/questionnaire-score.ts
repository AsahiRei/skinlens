export type ScoredOption = { value: string; points: number };
export type ScoredQuestion = {
  id: string;
  /** false = context only (e.g. "does this match?", "compared with last week"), never scored. */
  scored?: boolean;
  options?: ScoredOption[];
};

/**
 * 0–100 from the scored questions, rescaled so the worst possible answers give 0 and the best give
 * 100. (Plain total/max made the floor ~25, so a "critical" score was almost unreachable.)
 *
 * Unanswered questions are skipped rather than counted as worst. Returns null when nothing scored
 * was answered, so callers can tell "no data" apart from a real 0.
 */
export function scoreQuestionnaire(
  questions: ScoredQuestion[],
  answers: Record<string, string>,
): number | null {
  let total = 0;
  let range = 0;
  for (const q of questions) {
    if (q.scored === false || !q.options?.length) continue;
    const points = q.options.map((o) => o.points);
    const max = Math.max(...points);
    const min = Math.min(...points);
    if (max === min) continue;
    const selected = q.options.find((o) => o.value === answers[q.id]);
    if (!selected) continue;
    total += selected.points - min;
    range += max - min;
  }
  if (range === 0) return null;
  return Math.round((total / range) * 100);
}

/** Parses a score passed as a navigation param. A real 0 stays 0; missing/garbage → fallback. */
export function parseScoreParam(value: string | undefined | null, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
}
