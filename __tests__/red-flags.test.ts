import { describe, expect, it } from "@jest/globals";
import { detectRedFlag } from "@/utils/red-flags";

const level = (m: string) => detectRedFlag(m)?.level ?? null;

describe("detectRedFlag", () => {
  it.each([
    "my acne is so bad I want to kill myself",
    "I don't want to live anymore",
    "ayoko na mabuhay dahil sa mukha ko",
  ])("crisis: %s", (m: string) => expect(level(m)).toBe("crisis"));

  it.each([
    "my lips are swelling after using the new serum",
    "I can't breathe and my face is itchy",
    "hirap huminga after mag apply ng cream",
    "I have a rash and a fever",
    "skin is peeling off in sheets",
  ])("emergency: %s", (m: string) => expect(level(m)).toBe("emergency"));

  it.each([
    "I have a mole that is bleeding",
    "there's a new dark mole on my cheek",
    "this sore on my nose won't heal",
    "I think my pimple is infected",
    "I have a painful boil on my chin",
    "rash around my eyes",
    "the rash is spreading all over my body",
  ])("urgent: %s", (m: string) => expect(level(m)).toBe("urgent"));

  it.each([
    "what is hyaluronic acid?",
    "how do I get rid of whiteheads with pus?",
    "best eye cream for dark circles?",
    "can I use lip balm with retinol?",
    "how do I prevent infection when I pop a pimple",
    "should I boil water for my face steam",
    "find a dermatologist near me",
    "my skin is peeling",
  ])("no flag: %s", (m: string) => expect(level(m)).toBeNull());
});
