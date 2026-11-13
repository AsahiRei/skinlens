import { afterEach, describe, expect, it } from "@jest/globals";
import knowledge from "@/data/knowledge.json";
import evidence from "@/data/derm-validation.json";
import { evidenceFor } from "@/data/derm-validation";
import type { DermIngredientValidation } from "@/types/derm-validation";
import { ingredientsAvoidedBySensitivity, selectForProfile } from "@/utils/knowledge";
import { safetyExclusions } from "@/utils/safety";
import { buildRuleBasedRoutine } from "@/utils/routine-generator";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain Node CLI script
const { parseCsv } = require("../scripts/derm-review.js") as {
  parseCsv: (s: string) => string[][];
};

const EV = evidence.ingredients as DermIngredientValidation[];
const LEVELS = ["guideline", "regulatory", "association", "clinical", "emerging"];
const SOURCE_TYPES = ["guideline", "regulatory", "association", "peer_reviewed", "other"];
const REVIEW = ["pending", "approved", "approved_with_changes", "rejected"];

describe("knowledge base ↔ evidence dataset", () => {
  it("every recommendable ingredient has an evidence record, and vice versa", () => {
    const k = knowledge.ingredients.map((i) => i.name).sort();
    const e = EV.map((i) => i.name).sort();
    expect(e).toEqual(k);
  });

  it("every product only uses known ingredients", () => {
    const names = new Set(knowledge.ingredients.map((i) => i.name));
    for (const p of knowledge.products) {
      for (const i of p.recommended_ingredients) expect(names.has(i)).toBe(true);
    }
  });

  it.each(EV.map((e) => [e.name, e] as const))("%s is sourced and well-formed", (_n, e) => {
    expect(LEVELS).toContain(e.level);
    expect(e.evidence.length).toBeGreaterThan(40);
    expect(e.sources.length).toBeGreaterThanOrEqual(1);
    for (const s of e.sources) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(SOURCE_TYPES).toContain(s.type);
      expect(s.name.length).toBeGreaterThan(5);
    }
    // Something backed only by non-peer-reviewed sources can't claim more than "emerging".
    if (e.sources.every((s) => s.type === "other")) expect(e.level).toBe("emerging");
    // Guideline / regulatory levels need a guideline or regulatory source (or a consensus paper).
    if (e.level === "regulatory") expect(e.sources.some((s) => s.type === "regulatory")).toBe(true);
  });

  it.each(EV.map((e) => [e.name, e] as const))("%s has a valid dermatologist review", (_n, e) => {
    expect(REVIEW).toContain(e.review.status);
    if (e.review.status !== "pending") {
      // A sign-off must name a licensed reviewer and a date.
      expect(e.review.reviewer).toBeTruthy();
      expect(e.review.licenseNo).toBeTruthy();
      expect(e.review.date).toBeTruthy();
    }
  });

  it("PubMed sources use the canonical id URL", () => {
    for (const e of EV)
      for (const s of e.sources.filter((x) => x.url.includes("pubmed")))
        expect(s.url).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
  });
});

describe("evidence shapes recommendations", () => {
  it("prefers the guideline-backed retinoid over cosmetic retinol for acne", () => {
    const names = selectForProfile({ condition: "acne" }).ingredients.map((i) => i.name);
    expect(names.indexOf("Adapalene")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Adapalene")).toBeLessThan(names.indexOf("Retinol"));
  });

  it("never leads with a limited-evidence ingredient", () => {
    for (const condition of ["acne", "oily", "dry", "eczema", "normal"]) {
      const first = selectForProfile({ condition }).ingredients[0];
      expect(evidenceFor(first.name)?.level).not.toBe("emerging");
    }
  });

  describe("a dermatologist rejection removes the ingredient", () => {
    const record = evidenceFor("Adapalene")!;
    const original = { ...record.review };
    afterEach(() => {
      record.review = original;
    });
    it("is not recommended once rejected", () => {
      record.review = { ...original, status: "rejected" };
      const sel = selectForProfile({ condition: "acne" });
      expect(sel.ingredients.map((i) => i.name)).not.toContain("Adapalene");
      expect(sel.products.some((p) => p.recommended_ingredients.includes("Adapalene"))).toBe(false);
    });
  });
});

describe("retinoid class", () => {
  it("pregnancy excludes every retinoid, not just retinol", () => {
    const excluded = safetyExclusions({ pregnancy_status: "yes" }).map((x) => x.ingredient);
    expect(excluded).toEqual(expect.arrayContaining(["Retinol", "Adapalene"]));
    expect(excluded).not.toContain("Bakuchiol");
  });

  it.each([
    ["Differin made me peel", ["Adapalene"]],
    ["reacted to my retinol serum", ["Retinol"]],
    ["tretinoin burned", ["Retinol", "Adapalene"]],
    ["any retinoid irritates me", ["Retinol", "Adapalene"]],
  ])("%s → %j", (note, expected) => {
    const found = ingredientsAvoidedBySensitivity([{ notes: note }]);
    expect(found).toEqual(expect.arrayContaining(expected));
  });

  it("retinol alone does not drag in adapalene", () => {
    expect(ingredientsAvoidedBySensitivity([{ notes: "retinol stung" }])).not.toContain(
      "Adapalene",
    );
  });
});

describe("review sheet CSV parsing", () => {
  it("handles commas, quotes and newlines inside fields", () => {
    const rows = parseCsv('﻿"a","b"\r\n"x, y","he said ""hi""\nnext line"\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"\nnext line'],
    ]);
  });
});

describe("routines are coherent (products picked by role, not list position)", () => {
  const role = new Map(
    knowledge.products.map((p) => [p.product_type, p as { role?: string; night_only?: boolean }]),
  );
  const CASES = [
    ["oily", "acne"],
    ["oily", "oily"],
    ["dry", "dry"],
    ["sensitive", "eczema"],
    ["normal", "none"],
    ["combination", "acne"],
  ];

  it("every product has a role", () => {
    for (const p of knowledge.products) expect(role.get(p.product_type)?.role).toBeTruthy();
  });

  it.each(CASES)("%s / %s", (type, concern) => {
    const r = JSON.parse(buildRuleBasedRoutine(type, concern, 60));
    const kind = (name: string) => role.get(name)?.role;
    // Step 1 is always a cleanser, the last morning step always sunscreen.
    expect(kind(r.morning_routine[0].product_type)).toBe("cleanser");
    expect(kind(r.evening_routine[0].product_type)).toBe("cleanser");
    expect(kind(r.morning_routine.at(-1).product_type)).toBe("sunscreen");
    // Evening ends with a moisturizer; nothing occasional is in a daily step.
    expect(kind(r.evening_routine.at(-1).product_type)).toBe("moisturizer");
    for (const s of [...r.morning_routine, ...r.evening_routine])
      expect(kind(s.product_type)).not.toBe("occasional");
    // Night-only actives (retinoids, AHAs) never appear in the morning.
    for (const s of r.morning_routine) expect(role.get(s.product_type)?.night_only).toBeFalsy();
    // Each step's reason names an ingredient that is actually in that product.
    for (const s of [...r.morning_routine, ...r.evening_routine]) {
      const p = knowledge.products.find((x) => x.product_type === s.product_type);
      if (!p || /Clean skin absorbs/.test(s.reason)) continue;
      expect(p.recommended_ingredients.some((i) => s.reason.includes(i))).toBe(true);
    }
  });

  it("eczema gets no unrelated treatment serum", () => {
    const r = JSON.parse(buildRuleBasedRoutine("sensitive", "eczema", 60));
    const names = [...r.morning_routine, ...r.evening_routine].map(
      (s: { product_type: string }) => s.product_type,
    );
    expect(names).not.toContain("Antioxidant Serum");
  });

  it("acne leads with a guideline first-line treatment", () => {
    const r = JSON.parse(buildRuleBasedRoutine("oily", "acne", 60));
    const treatment = r.evening_routine[1].product_type as string;
    const lead = knowledge.products.find((p) => p.product_type === treatment)!
      .recommended_ingredients[0];
    expect(evidenceFor(lead)?.level).toBe("guideline");
    expect(["Benzoyl Peroxide", "Adapalene"]).toContain(lead);
  });

  it("never pairs a retinoid with an AHA exfoliant", () => {
    for (const [type, concern] of CASES) {
      const r = JSON.parse(buildRuleBasedRoutine(type, concern, 60));
      const types = r.recommended_products.map((p: { product_type: string }) => p.product_type);
      const retinoid = types.some((t: string) => /Retinol|Adapalene/.test(t));
      if (retinoid) expect(types).not.toContain("Gentle AHA Exfoliant");
    }
  });
});
