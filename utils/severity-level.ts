type SeverityLevel = {
  label: string;
  color: string;
  bgColor: string;
  description: string;
};

export function getSeverity(score: number): SeverityLevel {
  if (score >= 80) {
    return {
      label: "Excellent",
      color: "#15803d",
      bgColor: "#f0fdf4",
      description:
        "Your skin is in great shape! Maintain your current routine and protect your skin from sun exposure.",
    };
  }
  if (score >= 60) {
    return {
      label: "Good",
      color: "#65a30d",
      bgColor: "#f7fee7",
      description:
        "Your skin health is solid. Minor improvements with consistent care can take it to the next level.",
    };
  }
  if (score >= 40) {
    return {
      label: "Fair",
      color: "#d97706",
      bgColor: "#fffbeb",
      description:
        "Your skin needs some attention. A targeted routine addressing your concerns can make a big difference.",
    };
  }
  return {
    label: "Poor",
    color: "#dc2626",
    bgColor: "#fef2f2",
    description:
      "Your skin requires immediate care. Consider consulting a dermatologist and following a dedicated routine.",
  };
}