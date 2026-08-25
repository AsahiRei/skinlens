export type Severity = "excellent" | "good" | "fair" | "poor" | "critical";

export interface HealthScoreResponse {
  severity: Severity;
  label: string;
  message: string;
  color: string;
  trackColor: string;
}
