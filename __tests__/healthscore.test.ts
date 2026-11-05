import { describe, expect, it } from "@jest/globals";
import { getHealthScoreResponse } from "@/utils/healthscore";

describe("getHealthScoreResponse", () => {
  it.each([
    [100, "excellent"],
    [85, "excellent"],
    [84, "good"],
    [70, "good"],
    [69, "fair"],
    [50, "fair"],
    [49, "poor"],
    [30, "poor"],
    [29, "critical"],
    [0, "critical"],
  ])("score %i maps to %s", (score, severity) => {
    expect(getHealthScoreResponse(score).severity).toBe(severity);
  });

  it("falls back to the lowest band for out-of-range scores", () => {
    expect(getHealthScoreResponse(-10).severity).toBe("critical");
  });

  it("leaves no unfilled template placeholders", () => {
    const res = getHealthScoreResponse(72, { skin_type: "oily", main_concern: "acne" });
    expect(res.message).not.toContain("{personalizedClause}");
    expect(res.shortMessage).not.toContain("{personalizedClause}");
  });

  it("omits the personalized clause when answers are unknown", () => {
    const res = getHealthScoreResponse(72, { skin_type: "???", main_concern: "???" });
    expect(res.message).not.toContain(" for your ");
  });
});
