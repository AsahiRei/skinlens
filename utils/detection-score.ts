/**
 * Turns raw classifier output into the numbers the user sees.
 *
 * The classifier always returns *some* label, even for blurry, badly lit or
 * out-of-scope photos. These helpers decide when a result is too uncertain
 * to present as a finding, and blend the full probability spread (not just
 * the top label) into the skin health score.
 */

/** Per-class score anchors (0–100) used before the survey blend. */
export const DETECTION_BASELINES: Record<string, number> = {
  normal: 85,
  dry: 60,
  oily: 55,
  acne: 55,
  eczema: 40,
};

const DEFAULT_BASELINE = 50;

/** Top-class probability below this is treated as "couldn't tell". */
export const MIN_CONFIDENCE = 0.35;
/** Top-1 vs top-2 gap below this means the model is torn between two classes. */
export const MIN_MARGIN = 0.06;

/** Weight of the image detection vs the survey in the final score. */
const DETECTION_WEIGHT = 0.6;

export type DetectionAssessment = {
  inconclusive: boolean;
  reason: "low_confidence" | "ambiguous" | null;
  /** Runner-up label when the result is ambiguous. */
  runnerUp: string | null;
};

function sortedEntries(probabilities: Record<string, number> | null | undefined) {
  if (!probabilities) return [];
  return Object.entries(probabilities)
    .filter(([, p]) => typeof p === "number" && Number.isFinite(p))
    .sort((a, b) => b[1] - a[1]);
}

export function assessDetection(
  confidence: number,
  probabilities?: Record<string, number> | null,
): DetectionAssessment {
  const entries = sortedEntries(probabilities);
  const top = entries[0]?.[1] ?? confidence;
  if (!(top >= MIN_CONFIDENCE)) {
    return { inconclusive: true, reason: "low_confidence", runnerUp: null };
  }
  if (entries.length >= 2 && top - entries[1][1] < MIN_MARGIN) {
    return { inconclusive: true, reason: "ambiguous", runnerUp: entries[1][0] };
  }
  return { inconclusive: false, reason: null, runnerUp: null };
}

/**
 * Probability-weighted baseline: a 51% acne / 40% normal result scores
 * between the two anchors instead of snapping to the acne anchor.
 * Falls back to the top label's anchor when probabilities are missing.
 */
export function detectionBaseline(
  label: string,
  probabilities?: Record<string, number> | null,
): number {
  const entries = sortedEntries(probabilities).filter(
    ([k, p]) => k in DETECTION_BASELINES && p > 0,
  );
  const total = entries.reduce((s, [, p]) => s + p, 0);
  if (total <= 0) return DETECTION_BASELINES[label] ?? DEFAULT_BASELINE;
  return entries.reduce((s, [k, p]) => s + DETECTION_BASELINES[k] * (p / total), 0);
}

export function computeOverallScore(
  label: string,
  probabilities: Record<string, number> | null | undefined,
  surveyScore: number,
): number {
  const survey = Number.isFinite(surveyScore) ? surveyScore : DEFAULT_BASELINE;
  const raw =
    detectionBaseline(label, probabilities) * DETECTION_WEIGHT +
    survey * (1 - DETECTION_WEIGHT);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Skin types vs medical conditions need different wording. */
const CONDITION_LABELS = new Set(["acne", "eczema"]);

/**
 * User-facing phrase for a detection. Conditions are hedged ("signs
 * consistent with …") because the app is not a diagnostic tool.
 */
export function describeDetection(label: string): string {
  if (label === "normal") return "no major skin concerns";
  if (CONDITION_LABELS.has(label)) return `signs consistent with ${label}`;
  return `${label} skin`;
}

export function prettyLabel(label: string): string {
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

/** Health score display: "60/100", never "60%" (which reads as a probability). */
export function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "--";
  return `${Math.round(score)}/100`;
}
