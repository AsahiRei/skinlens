import type { DermIngredientValidation, DermValidationDataset } from "@/types/derm-validation";
import dermValidationData from "@/data/derm-validation.json";

/** Typed loader for dermatologist-validation dataset. */
export const dermValidations: DermIngredientValidation[] = (
  dermValidationData as DermValidationDataset
).ingredients;

export const dermValidationMeta = (dermValidationData as DermValidationDataset).meta;
