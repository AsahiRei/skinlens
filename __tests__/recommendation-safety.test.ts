import { describe, expect, it } from "@jest/globals";
import surveyQuestions from "@/data/survey-questions.json";
import knowledge from "@/data/knowledge.json";
import { parseScoreParam, scoreQuestionnaire } from "@/utils/questionnaire-score";
import {
  catalogProductsMentioned,
  ingredientsAvoidedBySensitivity,
  selectForProfile,
} from "@/utils/knowledge";
import { isDisputedResult, isPhotoBasedResult } from "@/utils/result-kind";
import { buildRuleBasedRoutine, generateRoutine } from "@/utils/routine-generator";
import { safetyExclusions } from "@/utils/safety";
import { findPhProducts } from "@/utils/ph-products";
import type { ChatUserContext } from "@/types/chat";
import {
  sanitizeSetupAnswers,
  setupContradiction,
  setupIrritants,
  setupOptionLabel,
} from "@/utils/setup-score";
import { needsUrgentCare } from "@/utils/urgent-care";

type Q = {
  id: string;
  label: string;
  scored?: boolean;
  options: { value: string; points: number }[];
};
const SURVEYS = surveyQuestions as Record<string, Q[]>;

/** Every ingredient named anywhere in a built routine's recommended products. */
const recommendedIngredients = (json: string): string[] =>
  (JSON.parse(json).recommended_products as { recommended_ingredients: string[] }[]).flatMap(
    (p) => p.recommended_ingredients,
  );

describe("sensitivity log understands how people actually write", () => {
  it.each([
    ["Neutrogena Oil-Free Acne Wash made my face burn", "Salicylic Acid"],
    ["neutrogena acne wash stung", "Salicylic Acid"],
    ["redness after the salicylic cleanser", "Salicylic Acid"],
    ["BHA toner stung", "Salicylic Acid"],
    ["allergic to tea tree", "Tea Tree Oil"],
    ["purging from tretinoin", "Retinol"],
    ["adapalene gel peeled my skin", "Adapalene"],
    ["AHA exfoliant burned", "Glycolic Acid"],
    ["cica cream made me break out", "Centella Asiatica"],
    ["Ingredients: Niacinamide.", "Niacinamide"],
  ])("%s → %s", (note, ingredient) => {
    expect(ingredientsAvoidedBySensitivity([{ trigger_cause: "product", notes: note }])).toContain(
      ingredient,
    );
  });

  it("does not over-match unrelated words", () => {
    const found = ingredientsAvoidedBySensitivity([
      { trigger_cause: "food", notes: "ahahaha, ate shrimp and vitamin and mineral pills" },
    ]);
    expect(found).not.toContain("Glycolic Acid");
    expect(found).not.toContain("Retinol");
  });

  it("finds catalog products by brand + product words", () => {
    expect(catalogProductsMentioned("my neutrogena acne wash").map((p) => p.brand)).toContain(
      "Neutrogena",
    );
    expect(catalogProductsMentioned("neutrogena")).toHaveLength(0);
  });
});

describe("logged triggers are never recommended again", () => {
  const MANY = [
    "Salicylic Acid",
    "Tea Tree Oil",
    "Benzoyl Peroxide",
    "Niacinamide",
    "Azelaic Acid",
    "Retinol",
    "Sulfur",
    "Zinc PCA",
    "Glycolic Acid",
    "Green Tea Extract",
    "Hyaluronic Acid",
    "Ceramides",
  ];

  it("keeps them out even when few options are left (no silent restore)", () => {
    const sel = selectForProfile({ condition: "acne", skin_type: "oily", avoid_ingredients: MANY });
    const lower = new Set(MANY.map((m) => m.toLowerCase()));
    for (const p of sel.products) {
      expect(p.recommended_ingredients.some((i) => lower.has(i.toLowerCase()))).toBe(false);
    }
    for (const i of sel.ingredients) expect(lower.has(i.name.toLowerCase())).toBe(false);
    // With 35 ingredients, avoiding these 12 still leaves safe options — no "ask a dermatologist".
    expect(sel.ingredients.length).toBeGreaterThan(0);
    expect(sel.notes.join(" ")).not.toMatch(/stay in the routine/);
  });

  it("points to a dermatologist when almost nothing safe is left", () => {
    const everything = knowledge.ingredients.map((i) => i.name).filter((n) => n !== "Glycerin");
    const sel = selectForProfile({ condition: "acne", avoid_ingredients: everything });
    expect(sel.notes.join(" ")).toMatch(/dermatologist/);
  });

  it("the built routine (including the fallback set) contains none of them", () => {
    const json = buildRuleBasedRoutine("oily", "acne", 50, undefined, { avoid_ingredients: MANY });
    const lower = new Set(MANY.map((m) => m.toLowerCase()));
    for (const i of recommendedIngredients(json)) expect(lower.has(i.toLowerCase())).toBe(false);
  });

  it("says which were left out", () => {
    const s = JSON.parse(
      buildRuleBasedRoutine("oily", "acne", 50, undefined, {
        avoid_ingredients: ["Salicylic Acid"],
      }),
    ).summary as string;
    expect(s).toContain("Left out Salicylic Acid because of your sensitivity log");
  });
});

/** Every routine step's product + reason, plus recommended ingredients — where retinol would show. */
const stepText = (json: string): string => {
  const r = JSON.parse(json);
  return [
    ...[...r.morning_routine, ...r.afternoon_routine, ...r.evening_routine].map(
      (s: { product_type: string; reason: string }) => `${s.product_type} ${s.reason}`,
    ),
    ...recommendedIngredients(json),
  ].join(" | ");
};

describe("safety exclusions (pregnancy, prescribed treatment)", () => {
  // Oily skin is where the routine picks a retinoid (retinol night serum) when nothing excludes it
  // — see the control test below — so these safety tests are meaningful.
  const acneRoutine = (extra: Record<string, string | null>) =>
    generateRoutine({
      skin_type: "oily",
      main_concern: "oily",
      sleep_quality: "good",
      stress_level: "low",
      water_intake: "1_5_to_2l",
      health_score: 50,
      ...extra,
    });

  it.each(["yes", "prefer_not_to_say"])("pregnancy=%s → no retinol, with the reason", async (v) => {
    const json = await acneRoutine({ pregnancy_status: v });
    expect(stepText(json)).not.toMatch(/retinol|adapalene/i);
    expect(JSON.parse(json).summary).toMatch(/pregnan/i);
  });

  it.each(["topical", "oral", "not_sure"])("treatment=%s → no extra retinol", async (v) => {
    const json = await acneRoutine({ current_treatment: v });
    expect(stepText(json)).not.toMatch(/retinol|adapalene/i);
  });

  it("control: without exclusions this routine DOES mention retinol (so the tests above mean something)", async () => {
    expect(stepText(await acneRoutine({}))).toMatch(/retinol/i);
  });

  it("the chatbot's product cards respect the same exclusion", () => {
    const avoid = safetyExclusions({ pregnancy_status: "yes" }).map((x) => x.ingredient);
    const cards = findPhProducts({
      ingredients: ["Retinol"],
      message: "retinol serum",
      ctx: { avoid_ingredients: avoid } as ChatUserContext,
    });
    expect(cards).toHaveLength(0);
  });

  it("no exclusions when not pregnant and not on treatment", () => {
    expect(safetyExclusions({ pregnancy_status: "no", current_treatment: "none" })).toEqual([]);
  });

  it("adds a patch-test reminder when an active is recommended", async () => {
    expect(JSON.parse(await acneRoutine({})).summary).toMatch(/patch-test/i);
  });
});

describe("after-scan survey questions", () => {
  it.each(Object.keys(SURVEYS))("%s starts with an unscored 'does this match?'", (label) => {
    const first = SURVEYS[label][0];
    expect(first.id).toBe("match");
    expect(first.scored).toBe(false);
    expect(first.options.map((o) => o.value)).toEqual(["yes", "not_sure", "no"]);
  });

  it("no scored question rewards or punishes how long you've had it", () => {
    for (const qs of Object.values(SURVEYS)) {
      expect(qs.some((q) => q.id === "duration")).toBe(false);
      const trend = qs.find((q) => q.id === "trend");
      if (trend) expect(trend.scored).toBe(false);
    }
  });

  it("severity questions use a 7-day window", () => {
    for (const qs of Object.values(SURVEYS)) {
      for (const q of qs.filter((x) => ["severity", "itch_level", "flaking_days"].includes(x.id))) {
        expect(q.label).toMatch(/past 7 days/i);
      }
    }
  });

  it("urgent-care answers still exist", () => {
    expect(needsUrgentCare("acne", { severity: "severe" })).toBe(true);
    expect(needsUrgentCare("dry", { severity: "severe" })).toBe(true);
    expect(needsUrgentCare("eczema", { itch_level: "very_itchy" })).toBe(true);
    expect(needsUrgentCare("eczema", { coverage: "large_area" })).toBe(true);
    const values = (label: string, id: string) =>
      SURVEYS[label].find((q) => q.id === id)!.options.map((o) => o.value);
    expect(values("acne", "severity")).toContain("severe");
    expect(values("eczema", "itch_level")).toContain("very_itchy");
    expect(values("eczema", "coverage")).toContain("large_area");
  });
});

describe("questionnaire scoring", () => {
  const acne = SURVEYS.acne;
  it("worst = 0, best = 100, unscored answers ignored", () => {
    expect(scoreQuestionnaire(acne, { match: "yes", severity: "severe", extent: "all_over" })).toBe(
      0,
    );
    expect(
      scoreQuestionnaire(acne, {
        match: "no",
        severity: "almost_clear",
        extent: "one_area",
        trend: "worse",
      }),
    ).toBe(100);
  });
  it("null when nothing scored was answered", () => {
    expect(scoreQuestionnaire(acne, { match: "no" })).toBeNull();
  });
  it("a real 0 survives the navigation param", () => {
    expect(parseScoreParam("0", 50)).toBe(0);
    expect(parseScoreParam("", 50)).toBe(50);
    expect(parseScoreParam("abc", 50)).toBe(50);
  });
});

describe("disputed scans", () => {
  it("are not photo-based (kept out of progress)", () => {
    const r = {
      detection_label: "acne",
      source_type: "scan_camera",
      survey_answers: '{"match":"no"}',
    };
    expect(isDisputedResult(r)).toBe(true);
    expect(isPhotoBasedResult(r)).toBe(false);
    expect(isPhotoBasedResult({ ...r, survey_answers: '{"match":"yes"}' })).toBe(true);
  });
});

describe("setup safety questions", () => {
  it("known irritants: valid picks only, 'none' is exclusive", () => {
    expect(
      sanitizeSetupAnswers({ known_irritants: "Retinol,Hacked,Tea Tree Oil" }).known_irritants,
    ).toBe("Retinol,Tea Tree Oil");
    expect(sanitizeSetupAnswers({ known_irritants: "Retinol,none" }).known_irritants).toBe("none");
    expect(setupIrritants({ known_irritants: "none" })).toEqual([]);
    expect(setupIrritants({ known_irritants: "Retinol,Tea Tree Oil" })).toEqual([
      "Retinol",
      "Tea Tree Oil",
    ]);
  });

  it("validates pregnancy / treatment values", () => {
    const clean = sanitizeSetupAnswers({ pregnancy_status: "maybe", current_treatment: "oral" });
    expect(clean.pregnancy_status).toBeUndefined();
    expect(clean.current_treatment).toBe("oral");
  });

  it("nudges normal skin with an oily/dry concern toward a better skin type", () => {
    expect(setupContradiction({ skin_type: "normal", main_concern: "dry" })).toMatch(/Combination/);
    expect(setupContradiction({ skin_type: "oily", main_concern: "acne" })).toBeNull();
  });

  it("water is asked in glasses", () => {
    expect(setupOptionLabel("water_intake", "500ml_to_1l")).toBe("2–3 glasses");
    expect(setupOptionLabel("water_intake", "more_than_2l")).toBe("8 glasses or more");
  });
});
