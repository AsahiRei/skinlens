export type SkinCondition = "acne" | "dry" | "eczema" | "oily" | "normal";

export type Ingredient = {
  name: string;
  description: string;
  concerns: SkinCondition[];
};

export type ProductEntry = {
  product_type: string;
  recommended_ingredients: string[];
  concerns: SkinCondition[];
};
