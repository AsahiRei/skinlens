import type { Severity } from "@/types/health";
import healthScoreData from "@/data/health-score.json";
import { DETECTION_BASELINES, describeDetection } from "@/utils/detection-score";

/**
 * Plain-language guide to the 0–100 skin score, one entry per band in data/health-score.json
 * (same cut-offs as the scan result screen, so a score never gets two different names).
 *
 * Wording is deliberately simple and non-diagnostic: "what it usually looks like", "what can
 * cause it", "what to do".
 */
export type ScoreBand = {
  severity: Severity;
  label: string;
  min: number;
  max: number;
  /** Text-safe colour (passes contrast on white cards). */
  color: string;
  /** Soft fill for chips and the score bar. */
  soft: string;
  /** One sentence a child could understand. */
  meaning: string;
  looksLike: string[];
  triggers: string[];
  todo: string[];
};

const STYLE: Record<Severity, { color: string; soft: string }> = {
  excellent: { color: "#214E36", soft: "#DCFCE7" },
  good: { color: "#3F7A57", soft: "#EAF6EE" },
  fair: { color: "#B45309", soft: "#FEF3C7" },
  poor: { color: "#C2410C", soft: "#FFEDD5" },
  critical: { color: "#DC2626", soft: "#FEE2E2" },
};

const COPY: Record<Severity, Pick<ScoreBand, "meaning" | "looksLike" | "triggers" | "todo">> = {
  excellent: {
    meaning: "Your skin looks clear and calm. Nothing to worry about.",
    looksLike: ["Few or no spots", "No itching, flaking or redness", "Skin feels comfortable"],
    triggers: [
      "Small dips here are normal — light, angle and the time of day change the photo a little",
    ],
    todo: ["Keep your routine the same", "Use sunscreen every day", "Scan once a week"],
  },
  good: {
    meaning: "Your skin is mostly healthy, with a few small things to fix.",
    looksLike: [
      "A few small spots, or a little shine or dryness",
      "Usually only in one area",
      "Little or no itching",
    ],
    triggers: [
      "Missing your routine on some days",
      "Hot, humid weather and sweat",
      "Short sleep or a stressful week",
      "Forgetting sunscreen",
    ],
    todo: ["Stay consistent with your routine", "Don't add many new products at once"],
  },
  fair: {
    meaning: "Your skin has a clear concern that needs regular care.",
    looksLike: [
      "Several spots or some red bumps (acne)",
      "Oily shine on the T-zone and cheeks, or dry, tight patches",
      "Problems in two or more areas",
    ],
    triggers: [
      "Not washing your face after sweating or before bed",
      "Touching or popping spots",
      "Heavy or oily products, or too much makeup",
      "Skipping moisturiser (dry skin) or over-washing (oily skin)",
      "Hormone changes, stress, little sleep",
      "Dirty pillowcase or phone screen",
    ],
    todo: [
      "Follow your routine morning and night",
      "Wash gently — twice a day is enough",
      "Give it 4–6 weeks before judging",
    ],
  },
  poor: {
    meaning: "Your skin needs attention. It is bothering you or spreading.",
    looksLike: [
      "Many spots or red bumps in several areas",
      "Itching or flaking on most days",
      "Signs that look like eczema, or cracking dry skin",
    ],
    triggers: [
      "A new product that irritates your skin (fragrance, alcohol, strong acids)",
      "Scrubbing hard or using too many active products",
      "Very hot showers, dry air, or air-conditioning",
      "Allergies, sweat, or rough fabrics",
      "Stopping a treatment too early",
    ],
    todo: [
      "Make your routine simple: gentle cleanser, moisturiser, sunscreen",
      "Stop any new product you started recently",
      "If it isn't better in 2 weeks, talk to a dermatologist",
    ],
  },
  critical: {
    meaning: "Your skin is having a hard time. Please get it checked by a doctor.",
    looksLike: [
      "Spots or patches all over the face",
      "Painful or deep lumps",
      "Itching that keeps you awake, or skin that cracks and peels",
    ],
    triggers: [
      "A strong reaction to a product or allergen",
      "A flare-up of a skin condition (acne, eczema)",
      "Infection, or picking at the skin",
    ],
    todo: [
      "See a dermatologist — you can book one in the app",
      "Use only gentle, fragrance-free products until then",
      "Don't pick, scrub or try new treatments on your own",
    ],
  },
};

type RawBand = { minScore: number; severity: Severity; label: string };

/** Highest band first, matching data/health-score.json. */
export const SCORE_BANDS: ScoreBand[] = (healthScoreData.bands as RawBand[]).map((b, i, all) => ({
  severity: b.severity,
  label: b.label,
  min: b.minScore,
  max: i === 0 ? 100 : all[i - 1].minScore - 1,
  ...STYLE[b.severity],
  ...COPY[b.severity],
}));

export function bandFor(score: number): ScoreBand {
  const s = Number.isFinite(score) ? score : 0;
  return SCORE_BANDS.find((b) => s >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

/** Share of the score that comes from the photo (see computeOverallScore). */
const PHOTO_WEIGHT = 0.6;

/**
 * One or two plain sentences on what set *this* score: the photo finding caps how high the
 * score can go, and the check-in answers decide where it lands under that cap.
 */
export function explainScore(score: number, detectionLabel?: string | null): string | null {
  const label = detectionLabel?.trim().toLowerCase();
  if (!label || !(label in DETECTION_BASELINES)) return null;
  const cap = Math.round(DETECTION_BASELINES[label] * PHOTO_WEIGHT + 100 * (1 - PHOTO_WEIGHT));
  const photo = `Your photo showed ${describeDetection(label)}.`;
  if (label === "normal") {
    return score >= 80
      ? `${photo} Your answers about how your skin feels were good too.`
      : `${photo} Most of the drop comes from your answers — things like itching, flaking or spots you told us about.`;
  }
  const gap = cap - score;
  return gap <= 5
    ? `${photo} With that, the best score possible is about ${cap}, and you're close to it. As this clears up, your score will go up.`
    : `${photo} With that, the best score possible is about ${cap}. Your answers (how much, how often, how many areas) brought it down to ${Math.round(score)}.`;
}
