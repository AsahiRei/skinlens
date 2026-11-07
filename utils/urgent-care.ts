/**
 * Decides when a scan's survey answers are serious enough to tell the user
 * to see a doctor in person. Deliberately narrow: only answers that describe
 * something a routine can't fix (widespread/painful acne, cracking skin,
 * sleep-disrupting or widespread eczema). "Severe" oiliness is cosmetic and
 * does not qualify.
 */

const URGENT_ANSWERS: Record<string, Record<string, string[]>> = {
  acne: { severity: ["severe"] },
  dry: { severity: ["severe"] },
  eczema: { itch_level: ["very_itchy"], coverage: ["large_area"] },
};

export function needsUrgentCare(
  label: string | null | undefined,
  answers: Record<string, string> | string | null | undefined,
): boolean {
  const rules = label ? URGENT_ANSWERS[label] : undefined;
  if (!rules || !answers) return false;

  let parsed: unknown = answers;
  if (typeof answers === "string") {
    try {
      parsed = JSON.parse(answers);
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const map = parsed as Record<string, unknown>;

  return Object.entries(rules).some(
    ([questionId, values]) =>
      typeof map[questionId] === "string" && values.includes(map[questionId] as string),
  );
}

// The reminder shows at most once per app session (cold start or return
// from background), so it stays noticeable without nagging on every tab
// switch. The results screen marks it shown so Home doesn't repeat it
// straight after the user just saw it.
let remindedThisSession = false;

export function shouldRemindUrgentCare(): boolean {
  return !remindedThisSession;
}

export function markUrgentCareReminded(): void {
  remindedThisSession = true;
}

export function resetUrgentCareReminder(): void {
  remindedThisSession = false;
}
