export type UserProfile = {
  username: string;
  email: string;
  age: string;
  phone_number: string;
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
};

export type ResultData = {
  severity: string;
  description: string;
  healthscore: number;
  recommendations: RecommendedProduct[] | null;
};

export type ScanDetectionResult = {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
  imageUri: string;
  sourceType: "camera" | "gallery";
};

export type SurveyAnswer = {
  questionId: string;
  value: string;
  points: number;
};
