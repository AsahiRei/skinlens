export type ClassificationResult = {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
  /** Model's severity head; absent when the top label is "normal" or the model has no such head. */
  severity?: {
    label: "mild" | "moderate" | "severe";
    confidence: number;
    probabilities: Record<string, number>;
  };
};
