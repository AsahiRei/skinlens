import type { HealthScoreResponse, Severity } from "@/types/health";
import healthScoreData from "@/data/health-score.json";

const concernLabels: Record<string, string> = healthScoreData.concernLabels;

const skinTypeLabels: Record<string, string> = healthScoreData.skinTypeLabels;

type HealthBand = {
  minScore: number;
  severity: Severity;
  label: string;
  color: string;
  trackColor: string;
  messageTemplate: string;
};

const bands = healthScoreData.bands as HealthBand[];

export const getHealthScoreResponse = (
  score: number,
  answers: Record<string, string> = {},
): HealthScoreResponse => {
  const skinType = skinTypeLabels[answers.skin_type] ?? "";
  const concern = concernLabels[answers.main_concern] ?? "";

  const personalizedClause =
    skinType && concern
      ? ` for your ${skinType} skin, with a focus on ${concern}`
      : "";

  const band =
    bands.find((b) => score >= b.minScore) ?? bands[bands.length - 1];

  return {
    severity: band.severity,
    label: band.label,
    message: band.messageTemplate.replace(
      "{personalizedClause}",
      personalizedClause,
    ),
    color: band.color,
    trackColor: band.trackColor,
  };
};
