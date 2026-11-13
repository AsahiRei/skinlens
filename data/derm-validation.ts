import type {
  DermIngredientValidation,
  DermValidationDataset,
  DermValidationLevel,
} from "@/types/derm-validation";
import dermValidationData from "@/data/derm-validation.json";

/** Typed loader for dermatologist-validation dataset. */
export const dermValidations: DermIngredientValidation[] = (
  dermValidationData as DermValidationDataset
).ingredients;

export const dermValidationMeta = (dermValidationData as DermValidationDataset).meta;

const BY_NAME = new Map(dermValidations.map((v) => [v.name.toLowerCase(), v]));

/** Evidence record for a knowledge-base ingredient (case-insensitive), or null. */
export function evidenceFor(name: string): DermIngredientValidation | null {
  return BY_NAME.get(name.toLowerCase()) ?? null;
}

/**
 * Ranking weight per evidence level — a tie-breaker inside the same relevance tier, so a
 * guideline-backed ingredient is preferred over a cosmetic one for the same concern.
 */
export const EVIDENCE_WEIGHT: Record<DermValidationLevel, number> = {
  guideline: 0.6,
  regulatory: 0.5,
  association: 0.4,
  clinical: 0.2,
  emerging: 0,
};

const AUTHORITY_TYPES = new Set(["guideline", "regulatory", "association"]);

/**
 * Ranking strength: the level weight, plus a little for each independent KIND of authority
 * behind it (guideline, regulator, association). Two ingredients at the same level are ordered
 * by how many authorities back them — e.g. adapalene (AAD guideline + FDA approval) ranks above
 * cosmetic retinol (class-level consensus only).
 */
export function evidenceStrength(name: string): number {
  const v = evidenceFor(name);
  if (!v) return 0;
  const authorities = new Set(
    v.sources.filter((s) => AUTHORITY_TYPES.has(s.type)).map((s) => s.type),
  );
  return EVIDENCE_WEIGHT[v.level] + 0.05 * authorities.size;
}

/** Short user-facing label for an evidence level. */
export const EVIDENCE_LABEL: Record<DermValidationLevel, string> = {
  guideline: "Dermatology guideline",
  regulatory: "FDA-recognized",
  association: "Dermatology association",
  clinical: "Clinical studies",
  emerging: "Limited evidence",
};

/** True when the project's dermatologist reviewed and rejected this ingredient's use. */
export function isRejectedByReviewer(name: string): boolean {
  return evidenceFor(name)?.review?.status === "rejected";
}
