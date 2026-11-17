/** Turns raw classifier output into the numbers the user sees. */

/** Per-class score anchors (0–100) used before the survey blend. */
export const DETECTION_BASELINES: Record<string, number> = {
  normal: 85,
  dry: 60,
  oily: 55,
  acne: 55,
  eczema: 40,
};

const DEFAULT_BASELINE = 50;

export const SEVERITY_LEVELS = ["mild", "moderate", "severe"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

/** The model's severity head, as carried between screens. */
export type ModelSeverity = {
  label: SeverityLevel;
  confidence: number;
  probabilities: Record<string, number>;
};

/**
 * Severity anchors for the conditions whose severity the model grades. They replace the flat
 * per-class anchor above, so mild and severe acne no longer score the same from the photo.
 * Dry and oily are skin types: the severity head isn't meaningful for them, so it's ignored.
 */
const SEVERITY_ANCHORS: Record<string, Record<SeverityLevel, number>> = {
  acne: { mild: 65, moderate: 50, severe: 35 },
  eczema: { mild: 50, moderate: 38, severe: 25 },
};

/** True when the model's severity rating is used for this label (and replaces survey questions). */
export function usesModelSeverity(label: string | null | undefined): boolean {
  return !!label && label in SEVERITY_ANCHORS;
}

/** Probability-weighted severity anchor; null when the label isn't graded or probs are unusable. */
function severityAnchor(label: string, severity: ModelSeverity | null | undefined): number | null {
  const anchors = SEVERITY_ANCHORS[label];
  if (!anchors || !severity) return null;
  const entries = SEVERITY_LEVELS.map((s) => [s, severity.probabilities[s]] as const).filter(
    ([, p]) => typeof p === "number" && Number.isFinite(p) && p > 0,
  );
  const total = entries.reduce((s, [, p]) => s + p, 0);
  if (total <= 0) return anchors[severity.label] ?? null;
  return entries.reduce((s, [k, p]) => s + anchors[k] * (p / total), 0);
}

/**
 * Validates the severity navigation param. Returns null for anything malformed, or when the label
 * isn't one whose severity we use.
 */
export function parseSeverityParam(
  value: string | null | undefined,
  label: string | null | undefined,
): ModelSeverity | null {
  if (!value || !usesModelSeverity(label)) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const p = parsed as Record<string, unknown>;
    if (!SEVERITY_LEVELS.includes(p.label as SeverityLevel)) return null;
    const probabilities: Record<string, number> = {};
    if (p.probabilities && typeof p.probabilities === "object") {
      for (const s of SEVERITY_LEVELS) {
        const v = (p.probabilities as Record<string, unknown>)[s];
        if (typeof v === "number" && Number.isFinite(v)) probabilities[s] = v;
      }
    }
    const confidence =
      typeof p.confidence === "number" && Number.isFinite(p.confidence) ? p.confidence : 0;
    return { label: p.label as SeverityLevel, confidence, probabilities };
  } catch {
    return null;
  }
}

/** Averages the severity head across multi-angle captures; null when no capture has one. */
export function averageSeverity(
  severities: (ModelSeverity | null | undefined)[],
): ModelSeverity | null {
  const present = severities.filter((s): s is ModelSeverity => !!s);
  if (present.length === 0) return null;
  const probabilities: Record<string, number> = {};
  for (const s of SEVERITY_LEVELS) {
    probabilities[s] =
      present.reduce((sum, x) => sum + (x.probabilities[s] ?? 0), 0) / present.length;
  }
  let label: SeverityLevel = SEVERITY_LEVELS[0];
  for (const s of SEVERITY_LEVELS) if (probabilities[s] > probabilities[label]) label = s;
  return { label, confidence: probabilities[label], probabilities };
}

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
 * Probability-weighted baseline: a 51% acne / 40% normal result scores between the two anchors
 * instead of snapping to the acne anchor. When the model graded the top label's severity (acne,
 * eczema), that label's anchor comes from the severity instead of the flat class anchor.
 */
export function detectionBaseline(
  label: string,
  probabilities?: Record<string, number> | null,
  severity?: ModelSeverity | null,
): number {
  const graded = severityAnchor(label, severity);
  const anchor = (k: string) =>
    k === label && graded != null ? graded : (DETECTION_BASELINES[k] ?? DEFAULT_BASELINE);
  const entries = sortedEntries(probabilities).filter(
    ([k, p]) => k in DETECTION_BASELINES && p > 0,
  );
  const total = entries.reduce((s, [, p]) => s + p, 0);
  if (total <= 0) return anchor(label);
  return entries.reduce((s, [k, p]) => s + anchor(k) * (p / total), 0);
}

export function computeOverallScore(
  label: string,
  probabilities: Record<string, number> | null | undefined,
  surveyScore: number,
  severity?: ModelSeverity | null,
): number {
  const survey = Number.isFinite(surveyScore) ? surveyScore : DEFAULT_BASELINE;
  const raw =
    detectionBaseline(label, probabilities, severity) * DETECTION_WEIGHT +
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
