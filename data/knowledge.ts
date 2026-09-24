import type { Ingredient, ProductEntry } from "@/types/knowledge";
import knowledgeData from "@/data/knowledge.json";

// Single source of truth lives in `data/knowledge.json` — this module keeps
// the existing typed import path (`@/data/knowledge`) working.
export const ingredients: Ingredient[] = knowledgeData.ingredients as Ingredient[];

export const products: ProductEntry[] = knowledgeData.products as ProductEntry[];
