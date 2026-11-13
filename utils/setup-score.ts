import questions from "@/data/user-setup-questions.json";
import { normalizeFirstName } from "@/lib/validation";
import { assessDetection, computeOverallScore, describeDetection } from "@/utils/detection-score";
import { scoreQuestionnaire } from "@/utils/questionnaire-score";

type SetupOption = { value: string; label: string; points: number };
export type SetupQuestion = {
  id: string;
  label: string;
  type: string;
  hint?: string;
  scored?: boolean;
  options?: SetupOption[];
};

const QUESTIONS = questions as SetupQuestion[];

/** Multi-select answers are stored comma-separated ("Retinol,Tea Tree Oil"); "none" is exclusive. */
export const MULTI_SEPARATOR = ",";

export function splitMulti(value: string | undefined | null): string[] {
  return (value ?? "")
    .split(MULTI_SEPARATOR)
    .map((v) => v.trim())
    .filter(Boolean);
}
const COMBINATION_DETAILS = ["oily", "dry", "acne", "sensitive"];

/** Combination sub-chips that can't both be on: skin leans oily or dry, not both. */
export const EXCLUSIVE_COMBINATION_DETAILS: Record<string, string> = { oily: "dry", dry: "oily" };

/**
 * Skin is either oily or dry, not both. Returns which way the skin-type answer leans
 * (an oily/dry type, or combination with the oily/dry chip on), or null if it doesn't.
 */
function skinLean(answers: Record<string, string>): "oily" | "dry" | null {
  const type = answers.skin_type;
  if (type === "oily" || type === "dry") return type;
  if (type === "combination") {
    if (answers.skin_type_oily === "true") return "oily";
    if (answers.skin_type_dry === "true") return "dry";
  }
  return null;
}

/**
 * Branching: main-concern options that contradict the skin type are hidden. Oily skin can't
 * pick "Dry Skin" as its concern, dry skin can't pick "Oily Skin".
 */
export function excludedConcerns(answers: Record<string, string>): string[] {
  const lean = skinLean(answers);
  if (lean === "oily") return ["dry"];
  if (lean === "dry") return ["oily"];
  return [];
}

/**
 * Keeps only answers the setup questionnaire can actually produce. The answers travel through
 * navigation params (face-enroll → setup → loading → results), so a deep link or a stale param
 * must not be able to write arbitrary values into the profile or fake a score.
 */
export function sanitizeSetupAnswers(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const clean: Record<string, string> = {};

  for (const q of QUESTIONS) {
    const value = input[q.id];
    if (typeof value !== "string" || !value.trim()) continue;
    if (q.type === "options") {
      if (q.options?.some((o) => o.value === value)) clean[q.id] = value;
    } else if (q.type === "multi") {
      const allowed = new Set(q.options?.map((o) => o.value));
      const picked = [...new Set(splitMulti(value).filter((v) => allowed.has(v)))];
      if (picked.includes("none")) clean[q.id] = "none";
      else if (picked.length > 0) clean[q.id] = picked.join(MULTI_SEPARATOR);
    } else if (q.type === "text") {
      clean[q.id] = normalizeFirstName(value);
    } else {
      clean[q.id] = value.trim();
    }
  }

  if (clean.skin_type === "combination") {
    for (const detail of COMBINATION_DETAILS) {
      const key = `skin_type_${detail}`;
      if (input[key] === "true") clean[key] = "true";
    }
    // Oily and dry together is a contradiction the UI can't produce — keep neither.
    if (clean.skin_type_oily && clean.skin_type_dry) {
      delete clean.skin_type_oily;
      delete clean.skin_type_dry;
    }
  }
  if (clean.main_concern && excludedConcerns(clean).includes(clean.main_concern)) {
    delete clean.main_concern;
  }
  return clean;
}

/** Combination sub-chips the user switched on, e.g. ["Oily", "Acne"]. */
export function combinationDetails(answers: Record<string, string>): string[] {
  return COMBINATION_DETAILS.filter((d) => answers[`skin_type_${d}`] === "true").map(
    (d) => d.charAt(0).toUpperCase() + d.slice(1),
  );
}

/**
 * 0–100 from the scored questions (concern, sleep, stress, water, sunscreen), rescaled so the
 * worst answers give 0. Skin type, gender and the safety questions are not scored. Always
 * recomputed from answers, never trusted from params.
 */
export function computeSetupScore(answers: Record<string, string>): number {
  return (
    scoreQuestionnaire(
      QUESTIONS.filter((q) => q.type === "options"),
      answers,
    ) ?? 0
  );
}

/** Ingredients the user said irritate them (setup "known irritants"). */
export function setupIrritants(answers: Record<string, string>): string[] {
  return splitMulti(answers.known_irritants).filter((v) => v !== "none");
}

/**
 * A non-blocking heads-up for a concern that hints the skin type may be off. Oily-vs-dry
 * contradictions can't happen any more — those options are hidden (see excludedConcerns).
 */
export function setupContradiction(answers: Record<string, string>): string | null {
  const type = answers.skin_type;
  const concern = answers.main_concern;
  if (type === "normal" && (concern === "dry" || concern === "oily"))
    return `You picked normal skin but ${concern === "dry" ? "dryness" : "oiliness"} as your main concern. If that's a regular issue, "${concern === "dry" ? "Dry" : "Oily"}" or "Combination" may describe your skin type better.`;
  return null;
}

export type PhotoClassification = {
  label: string;
  confidence: number;
  probabilities?: Record<string, number> | null;
};

export type SetupBaseline = {
  /** 0–100 starting score. */
  score: number;
  /** The graded photo, or null when the baseline is answers-only. */
  photo: { label: string; confidence: number } | null;
  /** Why the photo wasn't used (null when it was, or when there was no photo). */
  photoSkippedReason: "low_confidence" | "ambiguous" | null;
};

/**
 * The setup starting score, built exactly like a scan score (60% photo / 40% answers via
 * computeOverallScore) so the first real scan is compared like-for-like. A photo the model can't
 * read confidently is not graded: the baseline then falls back to answers only, and is kept out of
 * Progress trends (it has no detection label).
 */
export function combineSetupBaseline(
  answers: Record<string, string>,
  photo: PhotoClassification | null,
): SetupBaseline {
  const answersScore = computeSetupScore(answers);
  if (!photo) return { score: answersScore, photo: null, photoSkippedReason: null };
  const assessment = assessDetection(photo.confidence, photo.probabilities);
  if (assessment.inconclusive) {
    return { score: answersScore, photo: null, photoSkippedReason: assessment.reason };
  }
  return {
    score: computeOverallScore(photo.label, photo.probabilities, answersScore),
    photo: { label: photo.label, confidence: photo.confidence },
    photoSkippedReason: null,
  };
}

/**
 * Wording is guidance ("areas to work on"), never a verdict ("critical"), and says plainly what
 * the score is built from: the photo plus answers, or answers only.
 */
const SETUP_BANDS: {
  minScore: number;
  label: string;
  answersLead: string;
  photoLead: string;
}[] = [
  {
    minScore: 85,
    label: "Looking great",
    answersLead: "Your answers show habits that support healthy skin.",
    photoLead: "Your photo and answers point to healthy skin.",
  },
  {
    minScore: 70,
    label: "On track",
    answersLead: "Your answers show mostly skin-friendly habits.",
    photoLead: "Your photo and answers look mostly healthy.",
  },
  {
    minScore: 50,
    label: "Room to improve",
    answersLead: "A few of your habits could be holding your skin back.",
    photoLead: "Your photo and answers show a few things to work on.",
  },
  {
    minScore: 0,
    label: "Areas to work on",
    answersLead: "Several of your habits may be working against your skin.",
    photoLead: "Your photo and answers show several things to work on.",
  },
];

const CONCERN_FOCUS: Record<string, string> = {
  acne: "acne",
  eczema: "eczema",
  dry: "dryness",
  oily: "oiliness",
};

/** The "not a diagnosis" notice under the setup result. */
export function setupDisclaimer(photoUsed: boolean): string {
  const basis = photoUsed
    ? "This starting point combines an on-device estimate from your photo (60%) with your answers (40%) — the same way every scan is scored, so you can track change from here."
    : "This starting point is based only on your answers — your photo couldn't be graded reliably, so it is used to verify your identity only. Your first skin scan (in good, even light) will set your photo-based baseline.";
  return `${basis} It is a guide for monitoring your skin, not a medical diagnosis. Consult a licensed dermatologist for persistent, severe or worsening concerns.`;
}

export function getSetupProfileResponse(
  score: number,
  answers: Record<string, string> = {},
  photoLabel: string | null = null,
): { label: string; message: string } {
  const band = SETUP_BANDS.find((b) => score >= b.minScore) ?? SETUP_BANDS[SETUP_BANDS.length - 1];
  const skinType = answers.skin_type ? answers.skin_type.replace(/_/g, " ") : "";
  const focus = CONCERN_FOCUS[answers.main_concern];
  const routinePart = skinType
    ? focus
      ? `We've built a starter routine for your ${skinType} skin with a focus on ${focus}.`
      : `We've built a starter routine to keep your ${skinType} skin healthy.`
    : "We've built a starter routine from your answers.";
  if (photoLabel) {
    return {
      label: band.label,
      message: `${band.photoLead} Your photo shows ${describeDetection(photoLabel)}. ${routinePart} Scan regularly to see how your skin changes from this starting point.`,
    };
  }
  return {
    label: band.label,
    message: `${band.answersLead} ${routinePart} Your first skin scan will give you a photo-based baseline to track progress from.`,
  };
}

const ANSWER_LABELS: Record<string, string> = {
  first_name: "First name",
  age: "Date of birth",
  gender: "Gender",
  skin_type: "Skin type",
  main_concern: "Main concern",
  current_treatment: "Prescribed treatment",
  known_irritants: "Known irritants",
  pregnancy_status: "Pregnant / breastfeeding",
  sleep_quality: "Sleep",
  stress_level: "Stress",
  water_intake: "Water intake",
  sunscreen_use: "Sunscreen",
};

/**
 * Rows for the "Your Answers" card, showing the option text the user actually tapped
 * ("7 hours", "1.5–2 liters") instead of internal values ("good", "1_5_to_2l").
 */
export function describeSetupAnswers(
  answers: Record<string, string>,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const q of QUESTIONS) {
    const raw = answers[q.id];
    if (!raw) continue;
    let value =
      q.type === "multi"
        ? splitMulti(raw)
            .map((v) => q.options?.find((o) => o.value === v)?.label ?? v)
            .join(", ")
        : (q.options?.find((o) => o.value === raw)?.label ?? raw);
    if (q.id === "skin_type" && raw === "combination") {
      const details = combinationDetails(answers);
      if (details.length > 0) value = `${value} (${details.join(", ")})`;
    }
    rows.push({ label: ANSWER_LABELS[q.id] ?? q.id, value });
  }
  return rows;
}

/** The option text setup shows for a stored value ("1_5_to_2l" → "6–7 glasses"). */
export function setupOptionLabel(questionId: string, value: string): string {
  const q = QUESTIONS.find((x) => x.id === questionId);
  return q?.options?.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}

/** Allowed values for a setup question, in display order. */
export function setupOptionValues(questionId: string): string[] {
  return QUESTIONS.find((x) => x.id === questionId)?.options?.map((o) => o.value) ?? [];
}
