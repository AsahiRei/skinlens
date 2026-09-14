import type { SkinCondition } from "@/types/knowledge";
import { ingredients, products } from "@/data/knowledge";

const VALID_CONDITIONS: SkinCondition[] = ["acne", "eczema", "psoriasis", "normal"];

function normalizeCondition(label: string): SkinCondition {
  const lower = label.toLowerCase().trim();
  if (VALID_CONDITIONS.includes(lower as SkinCondition)) {
    return lower as SkinCondition;
  }
  return "normal";
}

export function getIngredientsForCondition(
  condition: string,
  concerns?: string,
) {
  const primary = normalizeCondition(condition);
  const matched = new Set<string>();

  const result = ingredients.filter((ing) => {
    if (ing.concerns.includes(primary)) {
      if (!matched.has(ing.name)) {
        matched.add(ing.name);
        return true;
      }
    }
    return false;
  });

  if (concerns) {
    const lowerConcerns = concerns.toLowerCase();
    for (const ing of ingredients) {
      if (!matched.has(ing.name) && lowerConcerns.includes(ing.name.toLowerCase())) {
        matched.add(ing.name);
        result.push(ing);
      }
    }
  }

  return result;
}

export function getProductsForCondition(
  condition: string,
  concerns?: string,
) {
  const primary = normalizeCondition(condition);
  const matched = new Set<string>();

  const result = products.filter((prod) => {
    if (prod.concerns.includes(primary)) {
      if (!matched.has(prod.product_type)) {
        matched.add(prod.product_type);
        return true;
      }
    }
    return false;
  });

  if (concerns) {
    const lowerConcerns = concerns.toLowerCase();
    for (const prod of products) {
      if (!matched.has(prod.product_type)) {
        const hasIngredient = prod.recommended_ingredients.some((ing) =>
          lowerConcerns.includes(ing.toLowerCase()),
        );
        if (hasIngredient) {
          matched.add(prod.product_type);
          result.push(prod);
        }
      }
    }
  }

  return result;
}

export function formatKnowledgeForPrompt(
  condition: string,
  concerns?: string,
): string {
  const matchedIngredients = getIngredientsForCondition(condition, concerns);
  const matchedProducts = getProductsForCondition(condition, concerns);

  if (matchedIngredients.length === 0 && matchedProducts.length === 0) {
    return "";
  }

  const lines: string[] = [];

  if (matchedIngredients.length > 0) {
    lines.push("DERMATOLOGIST-RECOMMENDED INGREDIENTS:");
    for (const ing of matchedIngredients) {
      lines.push(`- ${ing.name}: ${ing.description}`);
    }
  }

  if (matchedProducts.length > 0) {
    lines.push("\nRECOMMENDED PRODUCT TYPES:");
    for (const prod of matchedProducts) {
      lines.push(`- ${prod.product_type}: ${prod.recommended_ingredients.join(", ")}`);
    }
  }

  return lines.join("\n");
}
