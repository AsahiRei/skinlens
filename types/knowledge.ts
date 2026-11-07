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

/** Product with an optional example photo (Pexels) for chat display. */
export type ProductWithImage = ProductEntry & {
  imageUrl?: string;
  imageSourceUrl?: string;
  imageSourceName?: string;
};

/** A real product sold in the Philippines (curated sample, approximate price). */
export type PhProduct = {
  id: string;
  brand: string;
  name: string;
  product_type: string;
  size?: string;
  /** Knowledge-base ingredient names this product is a good example of. */
  key_ingredients: string[];
  /** Approximate PHP price range, e.g. "₱600–750". */
  price: string;
  good_for: (
    | "oily"
    | "dry"
    | "sensitive"
    | "acne"
    | "normal"
    | "combination"
    | "eczema"
    | "dark spots"
    | "aging"
  )[];
  /** The ingredient(s) from the user's request that matched this product. */
  matched?: string[];
};
