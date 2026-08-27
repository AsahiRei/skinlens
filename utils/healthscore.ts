<<<<<<< HEAD
import type { HealthScoreResponse, Severity } from "@/types/health";
=======
import type { Severity, HealthScoreResponse } from "@/types/health";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38

const concernLabels: Record<string, string> = {
  none: "maintaining clear skin",
  pigmentation: "pigmentation",
  acne: "acne",
  eczema: "eczema",
  psoriasis: "psoriasis",
};

const skinTypeLabels: Record<string, string> = {
  normal: "normal",
  combination: "combination",
  dry: "dry",
  oily: "oily",
  sensitive: "sensitive",
};

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

  if (score >= 85) {
    return {
      severity: "excellent",
      label: "Excellent",
      message: `Your skin health is in great shape. We've built a maintenance routine${personalizedClause} to help protect these results long-term.`,
      color: "#16a34a",
      trackColor: "#dcfce7",
    };
  }
  if (score >= 70) {
    return {
      severity: "good",
      label: "Good",
      message: `You're doing well overall. We've generated a routine${personalizedClause} to fine-tune a few areas and help you reach your best skin yet.`,
      color: "#65a30d",
      trackColor: "#ecfccb",
    };
  }
  if (score >= 50) {
    return {
      severity: "fair",
      label: "Fair",
      message: `There's room to improve. Your routine${personalizedClause} targets the key habits holding your skin health back.`,
      color: "#f59e0b",
      trackColor: "#fef3c7",
    };
  }
  if (score >= 30) {
    return {
      severity: "poor",
      label: "Poor",
      message: `Your skin health needs attention. We've created a focused routine${personalizedClause} to help you rebuild healthy habits step by step.`,
      color: "#f97316",
      trackColor: "#ffedd5",
    };
  }
  return {
    severity: "critical",
    label: "Critical",
    message: `Your skin health score is quite low right now. We've built a routine${personalizedClause} to address the most pressing issues first.`,
    color: "#ef4444",
    trackColor: "#fee2e2",
  };
};
