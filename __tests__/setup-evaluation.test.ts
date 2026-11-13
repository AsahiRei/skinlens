import { describe, expect, it } from "@jest/globals";
import { ageFromDob, ageFromStoredDob, formatDob, parseDob } from "@/lib/age";
import { firstNameError, normalizeFirstName } from "@/lib/validation";
import { buildRuleBasedRoutine } from "@/utils/routine-generator";
import { isPhotoBasedResult } from "@/utils/result-kind";
import {
  combineSetupBaseline,
  computeSetupScore,
  describeSetupAnswers,
  getSetupProfileResponse,
  excludedConcerns,
  sanitizeSetupAnswers,
  setupDisclaimer,
} from "@/utils/setup-score";

const BEST = {
  first_name: "Ana",
  age: "January 5, 2000",
  gender: "female",
  skin_type: "normal",
  main_concern: "none",
  sleep_quality: "excellent",
  stress_level: "very_low",
  water_intake: "more_than_2l",
};

const summaryOf = (json: string) => JSON.parse(json).summary as string;

describe("first-login routine summary", () => {
  it("never says 'improve none' or 'well-managed (none)' for the no-concern answer", () => {
    const s = summaryOf(buildRuleBasedRoutine("normal", "none", 100));
    expect(s).not.toMatch(/\bnone\b/);
    expect(s).toContain("maintain a healthy glow");
  });

  it("does not call a low score healthy or well-managed", () => {
    const s = summaryOf(buildRuleBasedRoutine("sensitive", "eczema", 24));
    expect(s).not.toMatch(/healthy|well-managed|great shape/);
    expect(s).toContain("needs some extra care");
    expect(s).toContain("with a focus on eczema");
  });

  it("uses the noun form of the concern", () => {
    expect(summaryOf(buildRuleBasedRoutine("oily", "dry", 52))).toContain("focus on dryness");
  });

  it.each(["less_than_500ml", "500ml_to_1l"])("gives the hydration tip for %s", (water) => {
    const s = summaryOf(
      buildRuleBasedRoutine("normal", "none", 60, {
        sleep_quality: "good",
        stress_level: "low",
        water_intake: water,
      }),
    );
    expect(s).toContain("extra water");
  });

  it("does not give the hydration tip for 1.5–2 liters", () => {
    const s = summaryOf(
      buildRuleBasedRoutine("normal", "none", 90, {
        sleep_quality: "good",
        stress_level: "low",
        water_intake: "1_5_to_2l",
      }),
    );
    expect(s).not.toContain("extra water");
  });
});

describe("sanitizeSetupAnswers", () => {
  it("drops values the questionnaire cannot produce", () => {
    const clean = sanitizeSetupAnswers({ ...BEST, skin_type: "<script>", sleep_quality: 5 });
    expect(clean.skin_type).toBeUndefined();
    expect(clean.sleep_quality).toBeUndefined();
    expect(clean.main_concern).toBe("none");
  });

  it("keeps combination chips only for combination skin, and only when on", () => {
    const combo = sanitizeSetupAnswers({
      ...BEST,
      skin_type: "combination",
      skin_type_oily: "true",
      skin_type_dry: "false",
    });
    expect(combo.skin_type_oily).toBe("true");
    expect(combo.skin_type_dry).toBeUndefined();

    const stale = sanitizeSetupAnswers({ ...BEST, skin_type: "oily", skin_type_acne: "true" });
    expect(stale.skin_type_acne).toBeUndefined();
  });

  it("branching: skin is oily or dry, never both", () => {
    expect(excludedConcerns({ skin_type: "oily" })).toEqual(["dry"]);
    expect(excludedConcerns({ skin_type: "dry" })).toEqual(["oily"]);
    expect(excludedConcerns({ skin_type: "combination", skin_type_dry: "true" })).toEqual(["oily"]);
    expect(excludedConcerns({ skin_type: "normal" })).toEqual([]);

    expect(
      sanitizeSetupAnswers({ ...BEST, skin_type: "oily", main_concern: "dry" }).main_concern,
    ).toBeUndefined();
    expect(
      sanitizeSetupAnswers({ ...BEST, skin_type: "dry", main_concern: "oily" }).main_concern,
    ).toBeUndefined();
    expect(
      sanitizeSetupAnswers({ ...BEST, skin_type: "oily", main_concern: "acne" }).main_concern,
    ).toBe("acne");

    const both = sanitizeSetupAnswers({
      ...BEST,
      skin_type: "combination",
      skin_type_oily: "true",
      skin_type_dry: "true",
    });
    expect(both.skin_type_oily).toBeUndefined();
    expect(both.skin_type_dry).toBeUndefined();
  });

  it("normalizes the name", () => {
    expect(sanitizeSetupAnswers({ first_name: "  ana   marie " }).first_name).toBe("ana marie");
  });

  it("returns {} for non-objects", () => {
    expect(sanitizeSetupAnswers(null)).toEqual({});
    expect(sanitizeSetupAnswers(["x"])).toEqual({});
  });
});

describe("computeSetupScore", () => {
  it("scores the best answers 100", () => {
    expect(computeSetupScore(BEST)).toBe(100);
  });
  it("does not score skin type (a type is not a health deficit)", () => {
    expect(computeSetupScore({ ...BEST, skin_type: "sensitive" })).toBe(100);
  });
  it("uses the full 0–100 range", () => {
    expect(
      computeSetupScore({
        main_concern: "eczema",
        sleep_quality: "very_poor",
        stress_level: "very_high",
        water_intake: "less_than_500ml",
        sunscreen_use: "rarely",
      }),
    ).toBe(0);
  });
});

describe("setup wording", () => {
  it("uses guidance labels, never verdicts like Critical", () => {
    const low = getSetupProfileResponse(24, { skin_type: "sensitive", main_concern: "eczema" });
    expect(low.label).toBe("Areas to work on");
    expect(low.message).not.toMatch(/critical|diagnos/i);
    expect(low.message).toContain("focus on eczema");
    expect(low.message).toContain("skin scan");
  });

  it("shows the option text the user tapped", () => {
    const rows = describeSetupAnswers(
      sanitizeSetupAnswers({
        ...BEST,
        sleep_quality: "good",
        water_intake: "1_5_to_2l",
        skin_type: "combination",
        skin_type_oily: "true",
        skin_type_acne: "true",
      }),
    );
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel["Sleep"]).toBe("7 hours");
    expect(byLabel["Water intake"]).toBe("6–7 glasses");
    expect(byLabel["Skin type"]).toBe("Combination (Oily, Acne)");
    expect(rows.some((r) => r.label.startsWith("skin_type_"))).toBe(false);
  });
});

describe("date of birth → age", () => {
  it("round-trips the stored format", () => {
    const d = new Date(2000, 0, 5);
    expect(parseDob(formatDob(d))?.getTime()).toBe(d.getTime());
  });
  it("counts whole years, respecting the birthday", () => {
    const dob = new Date(2000, 5, 15);
    expect(ageFromDob(dob, new Date(2026, 5, 14))).toBe(25);
    expect(ageFromDob(dob, new Date(2026, 5, 15))).toBe(26);
  });
  it("returns null for unparseable values instead of echoing the string", () => {
    expect(ageFromStoredDob("January 5, 2000")).toEqual(expect.any(Number));
    expect(ageFromStoredDob("garbage")).toBeNull();
    expect(ageFromStoredDob(null)).toBeNull();
  });
});

describe("first name validation", () => {
  it.each(["Ana", "Mary-Jane", "O'Neil", "José", "Ana Marie", "Ma. Cristina"])("accepts %s", (n) =>
    expect(firstNameError(n)).toBeNull(),
  );
  it.each(["", "   ", "x", "123", "!!", "😀😀", "a".repeat(51), "Ana1"])("rejects %p", (n) =>
    expect(firstNameError(n)).not.toBeNull(),
  );
  it("collapses whitespace", () => {
    expect(normalizeFirstName("  Ana   Marie ")).toBe("Ana Marie");
  });
});

describe("photo-based setup baseline", () => {
  const clearNormal = {
    label: "normal",
    confidence: 0.9,
    probabilities: { normal: 0.9, acne: 0.05, dry: 0.03, oily: 0.01, eczema: 0.01 },
  };

  it("blends photo and answers exactly like a scan (60/40)", () => {
    const b = combineSetupBaseline(BEST, clearNormal);
    expect(b.photo).toEqual({ label: "normal", confidence: 0.9 });
    // ~85 photo anchor * 0.6 + 100 answers * 0.4
    expect(b.score).toBeGreaterThanOrEqual(89);
    expect(b.score).toBeLessThanOrEqual(92);
  });

  it("falls back to answers only when the photo is low-confidence", () => {
    const b = combineSetupBaseline(BEST, {
      label: "acne",
      confidence: 0.3,
      probabilities: { acne: 0.3, normal: 0.25, dry: 0.2, oily: 0.15, eczema: 0.1 },
    });
    expect(b.photo).toBeNull();
    expect(b.photoSkippedReason).toBe("low_confidence");
    expect(b.score).toBe(100);
  });

  it("falls back to answers only when the model is torn", () => {
    const b = combineSetupBaseline(BEST, {
      label: "acne",
      confidence: 0.46,
      probabilities: { acne: 0.46, oily: 0.44, normal: 0.1 },
    });
    expect(b.photo).toBeNull();
    expect(b.photoSkippedReason).toBe("ambiguous");
  });

  it("is answers-only without a photo", () => {
    expect(combineSetupBaseline(BEST, null)).toEqual({
      score: 100,
      photo: null,
      photoSkippedReason: null,
    });
  });

  it("uses hedged, non-diagnostic photo wording", () => {
    const r = getSetupProfileResponse(55, { skin_type: "oily", main_concern: "acne" }, "acne");
    expect(r.message).toContain("signs consistent with acne");
    expect(r.message).not.toMatch(/you have acne|diagnos/i);
    expect(setupDisclaimer(true)).toContain("60%");
    expect(setupDisclaimer(false)).toContain("only on your answers");
    expect(setupDisclaimer(true)).toContain("not a medical diagnosis");
  });
});

describe("isPhotoBasedResult", () => {
  it("counts scans and photo-graded setup baselines", () => {
    expect(isPhotoBasedResult({ detection_label: "acne", source_type: "scan_camera" })).toBe(true);
    expect(isPhotoBasedResult({ detection_label: "normal", source_type: "ai_generated" })).toBe(
      true,
    );
    expect(isPhotoBasedResult({ detection_label: null, source_type: "scan_gallery" })).toBe(true);
  });
  it("excludes answers-only setup results (old and new)", () => {
    expect(isPhotoBasedResult({ detection_label: null, source_type: "ai_generated" })).toBe(false);
    expect(isPhotoBasedResult({ detection_label: "  ", source_type: null })).toBe(false);
  });
});
