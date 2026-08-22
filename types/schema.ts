export type UserProfile = {
  username: string;
  email: string;
  age: string;
  phone_number: string;
  created_at: any;
};

export type SkinProfile = {
  skin_type: string;
  main_concerns: string;
  healthscore: string;
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