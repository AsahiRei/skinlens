import { describe, expect, it } from "@jest/globals";
import {
  extractProductCards,
  formatSearchResultsForPrompt,
  isFollowUpQuery,
  isSkincareProductQuery,
} from "@/utils/web-search";

describe("web-search helpers", () => {
  it("detects skincare product queries", () => {
    expect(isSkincareProductQuery("best sunscreen for oily skin")).toBe(true);
    expect(isSkincareProductQuery("what time is it")).toBe(false);
  });

  it("detects follow-up shopping queries", () => {
    expect(isFollowUpQuery("Where can I buy those products?")).toBe(true);
    expect(isFollowUpQuery("hello")).toBe(false);
  });

  it("builds de-duplicated product cards with PH retailers", () => {
    const cards = extractProductCards(
      [
        { title: "Niacinamide Serum 10%", url: "https://shopee.ph/item/1", snippet: "with zinc" },
        { title: "Niacinamide Serum 5%", url: "https://shopee.ph/item/2", snippet: "" },
        { title: "Gentle Cleanser", url: "https://www.watsons.com.ph/x", snippet: "ceramide" },
      ],
      "serum for acne",
    );
    expect(cards.map((c) => c.product_type)).toEqual(["Serum", "Cleanser"]);
    expect(cards[0].retailer).toBe("shopee");
    expect(cards[0].recommended_ingredients).toEqual(["Niacinamide", "Zinc"]);
    expect(cards[1].recommended_ingredients).toEqual(["Ceramide"]);
  });

  it("formats at most five results for the prompt", () => {
    const results = Array.from({ length: 8 }, (_, i) => ({
      title: `T${i}`,
      url: `https://e.com/${i}`,
      snippet: "s",
    }));
    const text = formatSearchResultsForPrompt(results);
    expect(text).toContain("5. T4");
    expect(text).not.toContain("6. T5");
    expect(formatSearchResultsForPrompt([])).toBe("");
  });
});
