import { type SafetyExclusion, ingredientsInClass } from "@/utils/knowledge";

export type SafetyContext = {
  pregnancy_status?: string | null;
  current_treatment?: string | null;
};

/**
 * Ingredients the app must not recommend for this person, each with the reason shown to them.
 * Deliberately narrow and conservative — these are exclusions, not medical advice:
 *  - Pregnant / trying / breastfeeding (or prefers not to say): no retinoids (retinol, adapalene).
 *    Topical retinoids are the ingredient class most consistently advised against in pregnancy
 *    (see Kaplan 2015 in data/derm-validation.json; the precaution stands despite low measured
 *    risk). Bakuchiol is NOT offered as a "pregnancy-safe" swap: its pregnancy safety is unknown.
 *  - On any prescribed skin treatment (or unsure): no extra retinoid on top of it, since many
 *    prescriptions already are a retinoid (tretinoin, adapalene, isotretinoin) and stacking them
 *    is a common cause of irritation.
 */
export function safetyExclusions(ctx: SafetyContext | null | undefined): SafetyExclusion[] {
  const out: SafetyExclusion[] = [];
  const retinoids = ingredientsInClass("retinoid");
  const pregnancy = ctx?.pregnancy_status ?? null;
  if (pregnancy === "yes" || pregnancy === "prefer_not_to_say") {
    for (const ingredient of retinoids) {
      out.push({
        ingredient,
        reason:
          "Retinoids (retinol, adapalene) are left out because they are usually avoided during pregnancy and breastfeeding — check any product with your doctor.",
      });
    }
  }
  const treatment = ctx?.current_treatment ?? null;
  if (treatment === "topical" || treatment === "oral" || treatment === "not_sure") {
    for (const ingredient of retinoids) {
      out.push({
        ingredient,
        reason:
          "Retinoids are left out because you may already be on a prescribed treatment — ask your doctor before adding new active ingredients.",
      });
    }
  }
  return out;
}
