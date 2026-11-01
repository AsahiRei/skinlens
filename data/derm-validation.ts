import type { DermIngredientValidation, DermValidationDataset } from "@/types/derm-validation";
import dermValidationData from "@/data/derm-validation.json";

/**
 * Typed loader for dermatologist-validation dataset.
 * Single source of truth lives in `data/derm-validation.json` — this module
 * keeps the typed import path (`@/data/derm-validation`) working.
 */
export const dermValidations: DermIngredientValidation[] =
  (dermValidationData as DermValidationDataset).ingredients;

export const dermValidationMeta = (dermValidationData as DermValidationDataset).meta;