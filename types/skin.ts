export type ClassificationResult = {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
  /** Model's severity head; only set for acne and eczema, and when the model has such a head. */
  severity?: {
    label: "mild" | "moderate" | "severe";
    confidence: number;
    probabilities: Record<string, number>;
  };
};
