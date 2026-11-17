import type { PhProduct } from "@/types/knowledge";

/**
 * Philippine product catalog, reset Nov 2026 to put FILIPINO BRANDS first.
 *
 * Rules for an entry:
 *  - Its key ingredients are evidence-backed knowledge-base ingredients (see derm-validation.json).
 *    Limited-evidence actives (tea tree, green tea, clay, peptides, snail mucin…) were dropped.
 *  - FILIPINO BRANDS ONLY (origin "ph"): Celeteque & Myra (Unilab), Belo, Luxe Organix, Human
 *    Nature, Dr. Sensitive, Fresh Skinlab, Magwai, VMV Hypoallergenics. Imported brands are not
 *    listed — an ingredient with no Filipino-brand product simply gets no product cards.
 *  - Prices are approximate PHP from Watsons PH / official store listings and change often; the
 *    chat labels them as estimates and links to a store SEARCH so links never go stale.
 *  - Adapalene (Differin 0.1%) and azelaic acid 15% are absent: Watsons PH sells them
 *    prescription-only.
 */
export const PH_PRODUCTS: PhProduct[] = [
  // ── Virgin coconut oil: Philippine-studied ingredient ──────────────────
  // Two Philippine randomized double-blind trials: VCO beat mineral oil for xerosis (Agero &
  // Verallo-Rowell 2004) and for pediatric atopic dermatitis (Evangelista et al. 2014).
  {
    id: "vmv-know-it-oil",
    brand: "VMV Hypoallergenics",
    name: "Know-It-Oil (100% Organic Virgin Coconut Oil)",
    product_type: "Face & Body Oil",
    size: "35ml",
    key_ingredients: ["Virgin Coconut Oil"],
    price: "₱1,000–1,200",
    good_for: ["dry", "eczema", "sensitive"],
    caution: "Rich oil — can clog pores, so keep it off acne-prone areas.",
    origin: "ph",
  },
  {
    id: "human-nature-pure-vco",
    brand: "Human Nature",
    name: "Pure Virgin Coconut Oil",
    product_type: "Face & Body Oil",
    size: "200ml",
    key_ingredients: ["Virgin Coconut Oil"],
    price: "₱250–400",
    good_for: ["dry", "eczema"],
    caution: "Rich oil — can clog pores, so keep it off acne-prone areas.",
    origin: "ph",
  },

  // ── Niacinamide / salicylic acid ─────────────────────────────────────
  {
    id: "drsensitive-niacinamide-sa-serum",
    brand: "Dr. Sensitive",
    name: "Niacinamide 5% & Salicylic Acid Serum",
    product_type: "Serum",
    size: "30ml (10ml also sold)",
    key_ingredients: ["Niacinamide", "Salicylic Acid", "Hyaluronic Acid"],
    price: "₱249 (10ml ₱89)",
    good_for: ["oily", "acne", "combination"],
    origin: "ph",
  },
  {
    id: "drsensitive-niacinamide-sa-cleanser",
    brand: "Dr. Sensitive",
    name: "Niacinamide + Salicylic Acid Serum Cream Cleanser",
    product_type: "Cleanser",
    size: "80ml",
    key_ingredients: ["Salicylic Acid", "Niacinamide", "Hyaluronic Acid"],
    price: "₱150–170",
    good_for: ["oily", "acne", "combination"],
    origin: "ph",
  },
  {
    id: "luxe-organix-niacinamide-10",
    brand: "Luxe Organix",
    name: "Whitening Repair Niacinamide 10% Serum",
    product_type: "Serum",
    size: "30ml",
    key_ingredients: ["Niacinamide", "Hyaluronic Acid"],
    price: "₱500–575",
    good_for: ["oily", "acne", "dark spots", "combination"],
    origin: "ph",
  },
  {
    id: "belo-niacinamide-serum",
    brand: "Belo Essentials",
    name: "Niacinamide Serum",
    product_type: "Serum",
    size: "30ml",
    key_ingredients: ["Niacinamide"],
    price: "₱200–400",
    good_for: ["oily", "dark spots", "normal"],
    origin: "ph",
  },
  {
    id: "celeteque-acne-cleansing-gel",
    brand: "Celeteque",
    name: "DermoScience Acne Cleansing Gel",
    product_type: "Cleanser",
    size: "100ml (50ml also sold)",
    // Salicylic acid is the lead active (INCI lists also show AHAs; they differ by source).
    key_ingredients: ["Salicylic Acid"],
    price: "₱495 (50ml ₱270)",
    good_for: ["oily", "acne"],
    origin: "ph",
  },

  // ── Retinol ──────────────────────────────────────────────────────────
  {
    id: "luxe-organix-retinol-radiance",
    brand: "Luxe Organix",
    name: "Clinical Pro Retinol Radiance Serum",
    product_type: "Serum",
    size: "30ml",
    key_ingredients: ["Retinol"],
    price: "₱500–550",
    good_for: ["aging", "normal", "acne"],
    caution: "Night use only; start 2–3 nights a week. Not for use during pregnancy.",
    origin: "ph",
  },
  {
    id: "drsensitive-retinol-ceramide",
    brand: "Dr. Sensitive",
    name: "Retinol + Ceramide Serum",
    product_type: "Serum",
    size: "30ml",
    key_ingredients: ["Retinol", "Ceramides"],
    price: "₱300–350",
    good_for: ["aging", "normal", "acne"],
    caution: "Night use only; start 2–3 nights a week. Not for use during pregnancy.",
    origin: "ph",
  },

  // ── Vitamin C ────────────────────────────────────────────────────────
  {
    id: "luxe-organix-power-glow-vitc",
    brand: "Luxe Organix",
    name: "Power Glow Vita C Serum",
    product_type: "Serum",
    size: "30ml",
    key_ingredients: ["Vitamin C"],
    price: "₱450–500",
    good_for: ["dark spots", "normal", "oily"],
    origin: "ph",
  },
  {
    id: "fresh-skinlab-tomato-vitc",
    brand: "Fresh Skinlab",
    name: "Tomato Glass Skin 3-in-1 Vitamin C Brightening Serum",
    product_type: "Serum",
    size: "30ml",
    key_ingredients: ["Vitamin C"],
    price: "₱400–420",
    good_for: ["dark spots", "normal", "combination"],
    origin: "ph",
  },

  // ── Soothing ─────────────────────────────────────────────────────────
  {
    id: "luxe-organix-cica-rescue-serum",
    brand: "Luxe Organix",
    name: "Cica Rescue Calming Serum",
    product_type: "Serum",
    size: "30ml",
    // 70% Centella Asiatica leaf water + madecassoside.
    key_ingredients: ["Centella Asiatica"],
    price: "₱450–500",
    good_for: ["sensitive", "acne", "oily", "normal"],
    origin: "ph",
  },
  {
    id: "luxe-organix-aloe-99",
    brand: "Luxe Organix",
    name: "Aloe Vera Soothing Gel 99%",
    product_type: "Soothing Gel",
    size: "300ml (100ml sachet also sold)",
    key_ingredients: ["Aloe Vera"],
    price: "₱219 (100ml ₱109)",
    good_for: ["oily", "sensitive", "normal"],
    origin: "ph",
  },

  // ── Hydration / barrier ──────────────────────────────────────────────
  {
    id: "celeteque-hydration-wash",
    brand: "Celeteque",
    name: "DermoScience Hydration Facial Wash",
    product_type: "Cleanser",
    size: "100ml (60ml / 250ml also sold)",
    // pH-balanced (5.5) with glycerin and panthenol.
    key_ingredients: ["Glycerin", "Panthenol"],
    price: "₱90–310",
    good_for: ["dry", "normal", "combination"],
    origin: "ph",
  },
  {
    id: "human-nature-ceramide-night",
    brand: "Human Nature",
    name: "Ceramide Skin-Renewing Night Cream",
    product_type: "Moisturizer",
    key_ingredients: ["Ceramides", "Sunflower Seed Oil", "Jojoba Oil", "Glycerin"],
    price: "₱300–400",
    good_for: ["dry", "normal", "eczema"],
    origin: "ph",
  },
  {
    id: "myra-e-facial-moisturizer",
    brand: "Myra E",
    name: "Facial Moisturizer",
    product_type: "Moisturizer",
    size: "40ml",
    // Vitamins E, B3 (niacinamide) and B5 (panthenol).
    key_ingredients: ["Niacinamide", "Panthenol", "Vitamin E"],
    price: "₱120–135",
    good_for: ["normal", "dry", "combination"],
    contains_fragrance: true,
    caution: "Contains fragrance — skip it if your skin is sensitive or eczema-prone.",
    origin: "ph",
  },
  {
    id: "human-nature-sunflower-oil",
    brand: "Human Nature",
    name: "Sunflower Beauty Oil",
    product_type: "Face & Body Oil",
    size: "100ml",
    // Single ingredient: Helianthus Annuus (Sunflower) Seed Oil — fragrance-free.
    key_ingredients: ["Sunflower Seed Oil"],
    price: "₱300–330",
    good_for: ["dry", "eczema", "normal"],
    origin: "ph",
  },
  {
    id: "human-nature-sunflower-bakuchiol",
    brand: "Human Nature",
    name: "Sunflower Beauty Oil with Bakuchiol",
    product_type: "Face Oil",
    size: "30ml",
    // INCI: sunflower seed oil, triethyl citrate, bakuchiol, soybean oil, tocopherol, fragrance.
    key_ingredients: ["Bakuchiol", "Sunflower Seed Oil", "Vitamin E"],
    price: "₱290–310",
    good_for: ["normal", "dry", "aging"],
    contains_fragrance: true,
    caution: "Contains fragrance — skip it if your skin is sensitive or eczema-prone.",
    origin: "ph",
  },

  // ── Sunscreen ────────────────────────────────────────────────────────
  {
    id: "magwai-sheer-mineral-spf50",
    brand: "Magwai",
    name: "Sheer Mineral Sunscreen SPF50+",
    product_type: "Sunscreen",
    size: "30ml",
    // Mineral filters: zinc oxide + titanium dioxide.
    key_ingredients: ["Zinc Oxide", "Titanium Dioxide", "Glycerin"],
    price: "₱330–350",
    good_for: ["acne", "oily", "combination", "normal", "sensitive"],
    origin: "ph",
  },
  {
    id: "belo-sunexpert-dewy-essence",
    brand: "Belo",
    name: "SunExpert Dewy Essence Sunscreen SPF50 PA++++",
    product_type: "Sunscreen",
    size: "50ml (30ml also sold)",
    key_ingredients: ["Sunscreen"],
    price: "₱450 (30ml ₱270)",
    good_for: ["oily", "combination", "normal", "dry"],
    origin: "ph",
  },
  {
    id: "belo-sunexpert-mineral",
    brand: "Belo",
    name: "SunExpert Mineral Ultra Gentle Sunscreen SPF50",
    product_type: "Sunscreen",
    size: "50ml",
    key_ingredients: ["Zinc Oxide", "Titanium Dioxide"],
    price: "₱500–550",
    good_for: ["normal", "dry", "combination"],
    // Ingredient databases list fragrance in this formula.
    contains_fragrance: true,
    caution: "Listed with fragrance — sensitive skin may prefer a fragrance-free mineral SPF.",
    origin: "ph",
  },
];
