export type DermValidationLevel =
  | "guideline"
  | "regulatory"
  | "association"
  | "clinical"
  | "emerging";

export type DermValidationSource = {
  name: string;
  url: string;
};

export type DermIngredientValidation = {
  name: string;
  level: DermValidationLevel;
  dermatologistValidated: boolean;
  validatedBy: string[];
  evidence: string;
  sources: DermValidationSource[];
};

export type DermValidationDataset = {
  meta: {
    compiled: string;
    note: string;
    levels: Record<DermValidationLevel, string>;
  };
  ingredients: DermIngredientValidation[];
};