import { describe, expect, it } from "@jest/globals";
import knowledge from "@/data/knowledge.json";
import { PH_PRODUCTS } from "@/data/ph-products";
import type { ChatUserContext } from "@/types/chat";
import { selectForProfile } from "@/utils/knowledge";
import { findPhProducts } from "@/utils/ph-products";
import { buildRuleBasedRoutine } from "@/utils/routine-generator";

const KNOWN = new Set(knowledge.ingredients.map((i) => i.name));
// Catalog-only tags that aren't knowledge-base ingredients.
const CATALOG_ONLY = new Set(["Sunscreen", "Snail Mucin"]);

describe("Philippine product catalog", () => {
  it("only references knowledge-base ingredients", () => {
    for (const p of PH_PRODUCTS)
      for (const k of p.key_ingredients) expect(KNOWN.has(k) || CATALOG_ONLY.has(k)).toBe(true);
  });

  it("has unique ids", () => {
    const ids = PH_PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(["Sunflower Seed Oil", "Bakuchiol", "Mineral Oil", "Titanium Dioxide"])(
    "has a local example for %s",
    (ing) => {
      expect(PH_PRODUCTS.some((p) => p.key_ingredients.includes(ing))).toBe(true);
    },
  );

  it("never lists a prescription-only ingredient as something to buy", () => {
    const rx = knowledge.ingredients
      .filter((i) => (i as { prescription_in_ph?: boolean }).prescription_in_ph)
      .map((i) => i.name);
    expect(rx).toContain("Adapalene");
    for (const p of PH_PRODUCTS) for (const r of rx) expect(p.key_ingredients).not.toContain(r);
  });

  it("every fragranced product says so on the card", () => {
    for (const p of PH_PRODUCTS.filter((x) => x.contains_fragrance))
      expect(p.caution).toMatch(/fragrance/i);
  });
});

describe("fragrance and sensitive skin", () => {
  const ask = (ctx: ChatUserContext) =>
    findPhProducts({ ingredients: ["Mineral Oil", "Bakuchiol"], message: "any product?", ctx });

  it("hides fragranced products from sensitive or eczema-prone users", () => {
    for (const ctx of [{ skin_type: "sensitive" }, { main_concerns: "eczema" }]) {
      expect(ask(ctx).some((p) => p.contains_fragrance)).toBe(false);
    }
  });

  it("still offers them (with the caution) to other users", () => {
    const found = ask({ skin_type: "dry" });
    const baby = found.find((p) => p.id === "johnsons-baby-oil");
    expect(baby?.caution).toMatch(/fragrance/i);
  });
});

describe("adapalene is prescription-only in the Philippines", () => {
  it.each([
    ["oily", "acne"],
    ["combination", "acne"],
    ["normal", "acne"],
  ])("never in an automatic %s/%s routine", (type, concern) => {
    const r = JSON.parse(buildRuleBasedRoutine(type, concern, 60));
    const all = JSON.stringify(r.recommended_products) + JSON.stringify(r.evening_routine);
    expect(all).not.toMatch(/Adapalene Gel/);
  });

  it("acne users are told it exists and needs a dermatologist's prescription", () => {
    const notes = selectForProfile({ condition: "acne" }).notes.join(" ");
    expect(notes).toMatch(/Adapalene.*prescription in the Philippines.*dermatologist/);
  });

  it("no prescription note when retinoids are excluded (e.g. pregnancy)", () => {
    const notes = selectForProfile({
      condition: "acne",
      safety_exclusions: [{ ingredient: "Adapalene", reason: "pregnancy" }],
    }).notes.join(" ");
    expect(notes).not.toMatch(/prescription in the Philippines/);
  });
});
