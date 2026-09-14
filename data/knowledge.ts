import type { Ingredient, ProductEntry } from "@/types/knowledge";

export const ingredients: Ingredient[] = [
  // ACNE
  {
    name: "Salicylic Acid",
    description: "Beta-hydroxy acid that penetrates pores to unclog them and reduce blackheads/whiteheads",
    concerns: ["acne"],
  },
  {
    name: "Benzoyl Peroxide",
    description: "Kills acne-causing bacteria and helps clear breakouts",
    concerns: ["acne"],
  },
  {
    name: "Niacinamide",
    description: "Reduces inflammation, controls oil production, and fades acne marks",
    concerns: ["acne", "normal"],
  },
  {
    name: "Retinol",
    description: "Promotes cell turnover to prevent clogged pores and reduce scarring",
    concerns: ["acne"],
  },
  {
    name: "Tea Tree Oil",
    description: "Natural antibacterial agent that helps reduce mild acne",
    concerns: ["acne"],
  },

  // ECZEMA
  {
    name: "Ceramides",
    description: "Lipids that restore and protect the skin barrier, essential for eczema-prone skin",
    concerns: ["eczema"],
  },
  {
    name: "Hyaluronic Acid",
    description: "Deeply hydrates and helps repair damaged skin barrier",
    concerns: ["eczema", "normal"],
  },
  {
    name: "Colloidal Oatmeal",
    description: "Soothes itching and irritation, provides a protective barrier",
    concerns: ["eczema"],
  },
  {
    name: "Squalane",
    description: "Lightweight moisturizer that mimics skin's natural oils, non-irritating",
    concerns: ["eczema", "normal"],
  },
  {
    name: "Shea Butter",
    description: "Rich emollient that deeply moisturizes and reduces inflammation",
    concerns: ["eczema"],
  },

  // PSORIASIS
  {
    name: "Salicylic Acid (low concentration)",
    description: "Helps lift and remove psoriasis scales gently",
    concerns: ["psoriasis"],
  },
  {
    name: "Coal Tar",
    description: "Slows skin cell growth and reduces scaling and itching",
    concerns: ["psoriasis"],
  },
  {
    name: "Urea",
    description: "Softens thick scales and helps remove dead skin buildup",
    concerns: ["psoriasis"],
  },
  {
    name: "Aloe Vera",
    description: "Soothes irritation and provides cooling relief for inflamed plaques",
    concerns: ["psoriasis"],
  },
  {
    name: "Vitamin D",
    description: "Helps regulate skin cell growth and may reduce plaque formation",
    concerns: ["psoriasis"],
  },

  // NORMAL (maintenance and prevention)
  {
    name: "Vitamin C",
    description: "Antioxidant that brightens skin and protects against environmental damage",
    concerns: ["normal"],
  },
  {
    name: "Glycolic Acid",
    description: "Alpha-hydroxy acid that gently exfoliates and improves skin texture",
    concerns: ["normal"],
  },
  {
    name: "Zinc Oxide",
    description: "Mineral sunscreen ingredient that provides broad-spectrum UV protection",
    concerns: ["normal"],
  },
];

export const products: ProductEntry[] = [
  // ACNE
  {
    product_type: "Gentle Foaming Cleanser",
    recommended_ingredients: ["Salicylic Acid", "Tea Tree Oil"],
    concerns: ["acne"],
  },
  {
    product_type: "Acne Treatment Serum",
    recommended_ingredients: ["Benzoyl Peroxide", "Niacinamide"],
    concerns: ["acne"],
  },
  {
    product_type: "Oil-Free Moisturizer",
    recommended_ingredients: ["Niacinamide", "Hyaluronic Acid"],
    concerns: ["acne"],
  },

  // ECZEMA
  {
    product_type: "Cream Cleanser",
    recommended_ingredients: ["Ceramides", "Colloidal Oatmeal"],
    concerns: ["eczema"],
  },
  {
    product_type: "Barrier Repair Cream",
    recommended_ingredients: ["Ceramides", "Shea Butter", "Squalane"],
    concerns: ["eczema"],
  },
  {
    product_type: "Hydrating Serum",
    recommended_ingredients: ["Hyaluronic Acid", "Squalane"],
    concerns: ["eczema"],
  },

  // PSORIASIS
  {
    product_type: "Soothing Body Wash",
    recommended_ingredients: ["Colloidal Oatmeal", "Aloe Vera"],
    concerns: ["psoriasis"],
  },
  {
    product_type: "Scale Removal Treatment",
    recommended_ingredients: ["Salicylic Acid (low concentration)", "Urea"],
    concerns: ["psoriasis"],
  },
  {
    product_type: "Moisturizing Ointment",
    recommended_ingredients: ["Shea Butter", "Ceramides"],
    concerns: ["psoriasis"],
  },

  // NORMAL
  {
    product_type: "Daily Gentle Cleanser",
    recommended_ingredients: ["Glycolic Acid", "Hyaluronic Acid"],
    concerns: ["normal"],
  },
  {
    product_type: "Antioxidant Serum",
    recommended_ingredients: ["Vitamin C", "Niacinamide"],
    concerns: ["normal"],
  },
  {
    product_type: "Broad Spectrum Sunscreen",
    recommended_ingredients: ["Zinc Oxide"],
    concerns: ["normal"],
  },
];
