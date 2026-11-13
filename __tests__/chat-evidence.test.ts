import { describe, expect, it, jest } from "@jest/globals";
import { generateChatReply } from "@/utils/chat-assistant";
import {
  formatEvidenceReply,
  ingredientsForEvidenceQuestion,
  isEvidenceQuestion,
} from "@/utils/chat-evidence";
import { extractIngredientNames } from "@/utils/ph-products";

// jest.mock calls below are hoisted above these imports by babel-jest.

// The reply pipeline transitively imports Supabase (AsyncStorage) — use the library's Jest mock.
jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// No database is touched on the evidence path; stub the client so it loads without credentials.
jest.mock("@/utils/supabase", () => ({ supabase: {} }));

// The on-device LLM must never be reached for evidence questions: make it fail loudly.
jest.mock("@/utils/llama", () => ({
  getLlamaContext: jest.fn(() => {
    throw new Error("LLM must not be called for evidence questions");
  }),
  runExclusive: jest.fn(),
  preloadLlama: jest.fn(),
  releaseLlama: jest.fn(),
}));

describe("chatbot recognises the expanded knowledge base", () => {
  it.each([
    ["is zinc oxide sunscreen good for acne?", "Zinc Oxide"],
    ["does zinc help oily skin?", "Zinc PCA"],
    ["should I try differin?", "Adapalene"],
    ["adapalene or benzoyl peroxide?", "Adapalene"],
    ["what about a retinoid", "Adapalene"],
    ["can I use baby oil on dry skin", "Mineral Oil"],
    ["titanium dioxide sunscreen", "Titanium Dioxide"],
    ["is bakuchiol like retinol", "Bakuchiol"],
    ["sunflower oil for eczema?", "Sunflower Seed Oil"],
  ])("%s → %s", (msg, name) => {
    expect(extractIngredientNames(msg)).toContain(name);
  });

  it("zinc oxide is never read as zinc PCA", () => {
    expect(extractIngredientNames("zinc oxide sunscreen")).not.toContain("Zinc PCA");
  });

  it("retinol stays retinol (not adapalene)", () => {
    expect(extractIngredientNames("my retinol serum")).toEqual(["Retinol"]);
  });
});

describe("evidence questions", () => {
  it.each([
    "is niacinamide proven?",
    "what's the evidence for tea tree oil",
    "is azelaic acid dermatologist approved",
    "does salicylic acid really work",
    "any studies on bakuchiol?",
    "what is your source for that",
  ])("detects: %s", (q) => expect(isEvidenceQuestion(q)).toBe(true));

  it.each(["what is niacinamide?", "how do I use retinol at night", "my skin is peeling"])(
    "ignores: %s",
    (q) => expect(isEvidenceQuestion(q)).toBe(false),
  );

  it("finds ingredients named in the question", () => {
    expect(ingredientsForEvidenceQuestion("is niacinamide proven?", [])).toEqual(["Niacinamide"]);
  });

  it("follows 'what's your source for that?' back to the previous reply", () => {
    const history = [
      { role: "user" as const, content: "what helps acne" },
      { role: "assistant" as const, content: "Try benzoyl peroxide and azelaic acid." },
    ];
    expect(ingredientsForEvidenceQuestion("what is your source for that?", history)).toEqual([
      "Benzoyl Peroxide",
      "Azelaic Acid",
    ]);
  });

  it("returns nothing for an evidence word with no ingredient and no back-reference", () => {
    expect(ingredientsForEvidenceQuestion("are there studies?", [])).toEqual([]);
  });
});

describe("evidence reply", () => {
  it("states the level, summary and review status — no invented URLs", () => {
    const text = formatEvidenceReply(["Zinc PCA"]);
    expect(text).toMatch(/limited evidence/i);
    expect(text).toMatch(/no peer-reviewed clinical study/i);
    expect(text).toMatch(/review is still pending/i);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).toMatch(/patch-test/i);
  });

  it("warns when the ingredient is on the user's avoid list", () => {
    const text = formatEvidenceReply(["Adapalene"], { avoid_ingredients: ["Adapalene"] });
    expect(text).toMatch(/on your avoid list/);
  });

  it("is answered without the LLM and carries the evidence button", async () => {
    const reply = await generateChatReply([{ role: "user", content: "is niacinamide proven?" }]);
    expect(reply.evidence).toEqual(["Niacinamide"]);
    expect(reply.text).toMatch(/Niacinamide: dermatology guideline level of evidence/);
  });
});
