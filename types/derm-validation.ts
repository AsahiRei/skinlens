export type DermValidationLevel =
  "guideline" | "regulatory" | "association" | "clinical" | "emerging";

export type DermSourceType = "guideline" | "regulatory" | "association" | "peer_reviewed" | "other";

export type DermValidationSource = {
  name: string;
  url: string;
  type: DermSourceType;
};

/** "pending" until the project's licensed dermatologist signs off (scripts/derm-review.js). */
export type DermReviewStatus = "pending" | "approved" | "approved_with_changes" | "rejected";

export type DermReview = {
  status: DermReviewStatus;
  reviewer: string | null;
  licenseNo: string | null;
  date: string | null;
  notes: string | null;
};

export type DermIngredientValidation = {
  name: string;
  level: DermValidationLevel;
  dermatologistValidated: boolean;
  validatedBy: string[];
  evidence: string;
  sources: DermValidationSource[];
  review: DermReview;
};

export type DermValidationDataset = {
  meta: {
    compiled: string;
    note: string;
    levels: Record<DermValidationLevel, string>;
    sourceCheck?: string;
    sourceTypes?: Record<DermSourceType, string>;
    reviewStatuses?: Record<DermReviewStatus, string>;
  };
  ingredients: DermIngredientValidation[];
};
