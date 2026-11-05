import type { Dermatologist } from "./schema";
import type { PhProduct, ProductWithImage } from "./knowledge";

/** A clinic/hospital shown as a card inside the chat. */
export type ChatClinic = {
  id: string;
  name: string;
  specialty: string;
  address: string;
  /** 0 when the user's location is unknown. */
  distanceKm: number;
  /** From the Supabase `clinics` table (bookable in-app). */
  verified: boolean;
  latitude?: number;
  longitude?: number;
  rating: number;
  availableToday: boolean;
  phone?: string;
  website?: string;
  hours?: string;
  description?: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatUserContext = {
  first_name?: string | null;
  age?: string | null;
  gender?: string | null;
  skin_type?: string | null;
  main_concerns?: string | null;
  healthscore?: number | null;
  last_diagnosis?: string | null;
  detection_label?: string | null;
  severity?: string | null;
  sleep_quality?: string | null;
  water_intake?: string | null;
  stress_level?: string | null;
  routine_summary?: string | null;
  recommendations_summary?: string | null;
  sensitivity_triggers?: string | null;
  /** "6 scans since Oct 2; score 62 -> 74 (+12, improving); ..." */
  progress_summary?: string | null;
  /** Direction of the health score across recent scans. */
  score_trend?: "improving" | "declining" | "steady" | null;
  scan_count?: number | null;
  /** Days (0-7) in the last week with at least one routine step done. */
  routine_days_last_week?: number | null;
  /** Dermatologist review of the latest scan, e.g. "confirmed". */
  doctor_review?: string | null;
  doctor_notes?: string | null;
  /** Knowledge-base ingredients that appear in the sensitivity log. */
  avoid_ingredients?: string[] | null;
};

export type ChatRole = "user" | "assistant";

export type ChatImage = {
  id: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  sourceName: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  animate?: boolean;
  images?: ChatImage[];
  relatedProducts?: ProductWithImage[];
  phProducts?: PhProduct[];
  clinics?: ChatClinic[];
};
