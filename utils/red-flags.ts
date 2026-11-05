/**
 * Deterministic safety screen that runs BEFORE the on-device LLM.
 *
 * The local model is small and can't be trusted to escalate reliably, so
 * messages describing emergencies, warning signs of skin cancer/infection,
 * or self-harm get a fixed, reviewed reply instead of a generated one.
 * Patterns cover common English and Tagalog/Taglish phrasing.
 */

export type RedFlagLevel = "crisis" | "emergency" | "urgent";

export type RedFlagMatch = {
  level: RedFlagLevel;
  reply: string;
};

const CRISIS: RegExp[] = [
  /\b(kill|hurt|harm)(ing)? my ?self\b/i,
  /\bsuicid\w*/i,
  /\b(want|wanna|going) to die\b/i,
  /\bend (it all|my life)\b/i,
  /\b(no reason|don'?t want) to live\b/i,
  /\bpatayin ang sarili\b/i,
  /\bmagpakamatay\b/i,
  /\bayoko na(ng)? mabuhay\b/i,
];

const EMERGENCY: RegExp[] = [
  // Airway / anaphylaxis
  /\b(can'?t|cannot|hard to|trouble|difficulty|struggling to) breath\w*/i,
  /\bhirap (na )?huminga\b/i,
  /\b(throat|tongue|lips?) (is |are |feels? )?(swell\w*|swollen|closing|tight)/i,
  /\bswell\w* (of )?(my )?(throat|tongue|lips?)\b/i,
  /\banaphyla\w*/i,
  // Severe drug reaction / widespread blistering
  /\b(skin|it) (is )?(peeling|coming) off in (sheets|large pieces)\b/i,
  /\bblisters?\b.*\b(fever|mouth|eyes?|all over)\b/i,
  /\b(rash|blisters?)\b.*\b(fever|lagnat)\b/i,
  /\b(fever|lagnat)\b.*\b(rash|blisters?|pantal)\b/i,
  // Spreading infection
  /\bred (streaks?|lines?) (spreading|going|coming)\b/i,
  /\b(spreading|fast[- ]spreading) (redness|infection)\b.*\b(fever|hot|pain)\b/i,
  // Chemical burns / eyes
  /\bchemical burn\b/i,
  /\b(got|went|splashed) (it )?(in|into) my eyes?\b/i,
];

const URGENT: RegExp[] = [
  // Melanoma warning signs
  /\bmoles?\b.*\b(bleed\w*|itch\w*|chang\w*|grow\w*|bigger|irregular|dark(er|ening)|new|uneven|spreading|crust\w*)\b/i,
  /\b(bleed\w*|chang\w*|grow\w*|new|bigger|irregular) (dark )?(mole|spot|nunal)\b/i,
  /\bnunal\b.*\b(dumudugo|lumalaki|nagbago)\b/i,
  /\b(sore|wound|sugat|spot|bump)\b.*\b(won'?t|doesn'?t|not|hindi) (heal|gumagaling)\w*/i,
  // Infection
  // (Pus in a pimple is ordinary acne, so "pus" alone is not a flag.)
  /\b(abscess|pigsa|carbuncle)\b/i,
  /\b(a|painful|big|large|huge) boils?\b|\bboils? on\b/i,
  /\b(is|looks?|got|getting|became|seems?|might be) infected\b/i,
  /\binfection (on|in) my\b/i,
  // Eye area
  /\b(rash|swelling|swollen|redness|blisters?)\b.*\b(eye|eyes|eyelids?)\b/i,
  // Severe or rapidly worsening
  /\b(severe|unbearable|extreme|matinding) (pain|itch\w*|burn\w*|sakit|kati)\b/i,
  /\b(spreading|getting worse|worsening) (fast|quickly|rapidly)\b/i,
  /\b(rash|hives|pantal)\b.*\b(spreading|all over|whole body|buong katawan)\b/i,
  /\bshingles\b/i,
];

const CRISIS_REPLY =
  "I'm really sorry you're feeling this way, and I'm glad you said something. You don't have to go through this alone. " +
  "Please reach out now to the NCMH Crisis Hotline at 1553 (free, 24/7), or call 911 if you are in immediate danger. " +
  "Talking to someone you trust, like a friend or family member, can also help right now.";

const EMERGENCY_REPLY =
  "What you're describing can be a medical emergency. Please go to the nearest emergency room or call 911 now. " +
  "Don't wait to see if it gets better, and don't apply new products to the area.";

const URGENT_REPLY =
  "That's worth having a doctor look at soon rather than treating at home. Signs like a changing or bleeding mole, a painful boil, " +
  "a sore that won't heal, or a rash near the eyes or spreading quickly need an in-person check. " +
  "Please book a dermatologist visit within the next few days. Ask me \"find a dermatologist near me\" and I'll look one up.";

export function detectRedFlag(message: string): RedFlagMatch | null {
  const text = message.trim();
  if (!text) return null;
  if (CRISIS.some((re) => re.test(text))) {
    return { level: "crisis", reply: CRISIS_REPLY };
  }
  if (EMERGENCY.some((re) => re.test(text))) {
    return { level: "emergency", reply: EMERGENCY_REPLY };
  }
  if (URGENT.some((re) => re.test(text))) {
    return { level: "urgent", reply: URGENT_REPLY };
  }
  return null;
}
