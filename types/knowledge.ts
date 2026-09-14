export type SkinCondition = "acne" | "eczema" | "psoriasis" | "normal";

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
