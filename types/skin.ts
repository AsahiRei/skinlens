export type ClassificationResult = {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
};
