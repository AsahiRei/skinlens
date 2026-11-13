export type SkinCondition = "acne" | "dry" | "eczema" | "oily" | "normal";

export type Ingredient = {
  name: string;
  description: string;
  concerns: SkinCondition[];
  /** Drug classes used by safety rules, e.g. "retinoid" (excluded in pregnancy). */
  classes?: string[];
  /**
   * Sold only with a prescription in the Philippines (e.g. adapalene / Differin at Watsons PH).
   * Kept in the knowledge base, but never put in an automatic routine.
   */
  prescription_in_ph?: boolean;
};

/** Where a product sits in a routine. "occasional" = masks/exfoliants used 1-3x a week. */
export type ProductRole = "cleanser" | "treatment" | "moisturizer" | "sunscreen" | "occasional";

export type ProductEntry = {
  product_type: string;
  /** Key active first — it defines the product's evidence level and its routine reason. */
  recommended_ingredients: string[];
  concerns: SkinCondition[];
  role?: ProductRole;
  /** Evening only (retinoids, AHAs raise sun sensitivity). */
  night_only?: boolean;
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
  /** Contains added fragrance/parfum (per its INCI list) — hidden for sensitive/eczema profiles. */
  contains_fragrance?: boolean;
  /** One-line caution shown on the card (e.g. "Contains fragrance"). */
  caution?: string;
  /** The ingredient(s) from the user's request that matched this product. */
  matched?: string[];
};
