import { describe, expect, it } from "@jest/globals";
import {
  assessDetection,
  computeOverallScore,
  describeDetection,
  detectionBaseline,
  formatScore,
} from "@/utils/detection-score";

describe("assessDetection", () => {
  it("accepts a clear, confident result", () => {
    const r = assessDetection(0.82, {
      acne: 0.82,
      oily: 0.1,
      normal: 0.05,
      dry: 0.02,
      eczema: 0.01,
    });
    expect(r.inconclusive).toBe(false);
  });

  it("flags low confidence", () => {
    const r = assessDetection(0.31, {
      acne: 0.31,
      oily: 0.25,
      normal: 0.2,
      dry: 0.14,
      eczema: 0.1,
    });
    expect(r).toEqual({ inconclusive: true, reason: "low_confidence", runnerUp: null });
  });

  it("flags a near-tie between the top two classes", () => {
    const r = assessDetection(0.48, { acne: 0.48, oily: 0.44, normal: 0.08 });
    expect(r.inconclusive).toBe(true);
    expect(r.reason).toBe("ambiguous");
    expect(r.runnerUp).toBe("oily");
  });

  it("falls back to the scalar confidence without probabilities", () => {
    expect(assessDetection(0.9, null).inconclusive).toBe(false);
    expect(assessDetection(0.2, null).inconclusive).toBe(true);
    expect(assessDetection(NaN, null).inconclusive).toBe(true);
  });
});

describe("detectionBaseline / computeOverallScore", () => {
  it("weights anchors by probability instead of snapping to the top label", () => {
    const certain = detectionBaseline("acne", { acne: 1 });
    const split = detectionBaseline("acne", { acne: 0.5, normal: 0.5 });
    expect(certain).toBe(55);
    expect(split).toBe(70);
  });

  it("uses the label anchor when probabilities are missing", () => {
    expect(detectionBaseline("eczema", null)).toBe(40);
    expect(detectionBaseline("unknown", null)).toBe(50);
  });

  it("blends 60/40 with the survey and clamps to 0-100", () => {
    expect(computeOverallScore("normal", { normal: 1 }, 100)).toBe(91);
    expect(computeOverallScore("acne", { acne: 1 }, 50)).toBe(53);
    expect(computeOverallScore("acne", { acne: 1 }, NaN)).toBe(53);
    expect(computeOverallScore("normal", { normal: 1 }, 1000)).toBe(100);
  });

  it("a confident acne result scores lower than an uncertain one leaning normal", () => {
    const confident = computeOverallScore("acne", { acne: 0.95, normal: 0.05 }, 60);
    const unsure = computeOverallScore("acne", { acne: 0.51, normal: 0.49 }, 60);
    expect(confident).toBeLessThan(unsure);
  });
});

describe("display helpers", () => {
  it("hedges medical conditions but not skin types", () => {
    expect(describeDetection("eczema")).toBe("signs consistent with eczema");
    expect(describeDetection("oily")).toBe("oily skin");
    expect(describeDetection("normal")).toBe("no major skin concerns");
  });

  it("formats scores out of 100", () => {
    expect(formatScore(59.6)).toBe("60/100");
    expect(formatScore(null)).toBe("--");
  });
});
