export type UserProfile = {
  username: string;
  first_name?: string;
  email: string;
  age: string;
  gender?: string;
  user_setup?: boolean;
  created_at: any;
};

export type SkinProfile = {
  skin_type: string;
  main_concerns: string;
};

export type Result = {
  id: number;
  severity: string;
  description: string;
  healthscore: number;
  image_url: string | null;
  source_type: string;
  recommendations: RecommendedProduct[] | null;
  user_id: string;
  created_at: any;
  confidence?: number | null;
  detection_label?: string | null;
  survey_answers?: string | null;
};

export type LifestyleProfile = {
  sleep_quality: string;
  water_intake: string;
  stress_level: string;
};

export type RoutineStep = {
  step: number;
  product_type: string;
  instruction: string;
  reason: string;
};

export type RecommendedProduct = {
  product_type: string;
  recommended_ingredients: string[];
  reason: string;
};

export type Routine = {
  summary: string;
  morning_routine: RoutineStep[];
  afternoon_routine: RoutineStep[];
  evening_routine: RoutineStep[];
  recommended_products: RecommendedProduct[];
};

export type Period = "morning" | "afternoon" | "evening";

export type Dermatologist = {
  id: string;
  name: string;
  specialty: string;
  clinic: string;
  address: string;
  distanceKm: number;
  rating: number;
  availableToday: boolean;
};

export type FaceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  pitchAngle?: number;
  rollAngle?: number;
  yawAngle?: number;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
  frameWidth?: number;
  frameHeight?: number;
};

export type LightingQuality = "dark" | "dim" | "good" | "bright" | "glare";

export type AlignmentStatus = {
  isCentered: boolean;
  isLevel: boolean;
  isFacingFront: boolean;
  score: number;
};

export type ScanAngle = "front" | "left" | "right";

export type ResultData = {
  severity: string;
  description: string;
  healthscore: number;
  recommendations: RecommendedProduct[] | null;
};

export type SensitivityEntry = {
  id: number;
  trigger_cause: string;
  severity: string;
  notes: string | null;
  occurred_at: string;
  created_at: string;
};

export type NotificationType = "scan_reminder" | "daily_tip";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

export type NotificationSettings = {
  scanReminders: boolean;
  dailyTips: boolean;
};
