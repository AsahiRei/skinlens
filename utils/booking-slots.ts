/**
 * Booking slot helpers for the patient appointment picker.
 *
 * Clinic hours are free text in the `clinics` table ("Mon–Sat 9:00 AM – 5:00 PM", "9am-6pm", …).
 * We read what we safely can from them and fall back to a 9 AM – 5 PM day, so the picker always
 * offers sensible 30-minute slots. The doctor still confirms the exact time.
 */
/** Matches SLOT_MINUTES in lib/db/appointments and appointment_slot_length() on the server. Kept
 * local so this module stays free of the Supabase client (unit-testable). */
const SLOT_MINUTES = 30;

export type ClinicHours = {
  /** Minutes after midnight the first slot can start. */
  openMin: number;
  /** Minutes after midnight the clinic closes (last slot ends here). */
  closeMin: number;
  /** Weekdays (0 = Sunday) with no slots. */
  closedDays: number[];
  /** True when the hours came from the clinic's own text, not the fallback. */
  parsed: boolean;
};

export const DEFAULT_HOURS: ClinicHours = {
  openMin: 9 * 60,
  closeMin: 17 * 60,
  closedDays: [],
  parsed: false,
};

/** How many days ahead the patient can pick from. */
export const BOOKING_WINDOW_DAYS = 14;

const TIME_RE = /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/gi;
const RANGE = "\\s*(?:-|–|—|to|thru|through)\\s*";

type Hit = { h: number; m: number; mer: "am" | "pm" | null };

function toMinutes({ h, m, mer }: Hit): number {
  let hour = h % 12;
  if (mer === "pm") hour += 12;
  else if (mer === null) hour = h; // 24h or bare hour, fixed up by the caller
  return hour * 60 + m;
}

function closedDaysFrom(text: string): number[] {
  const t = text.toLowerCase();
  const closed = new Set<number>();
  if (new RegExp(`mon\\w*${RANGE}fri`).test(t)) {
    closed.add(0);
    closed.add(6);
  } else if (new RegExp(`mon\\w*${RANGE}sat`).test(t)) {
    closed.add(0);
  }
  if (/sun\w*\s*:?\s*closed|closed\s*(?:on\s*)?sun/.test(t)) closed.add(0);
  if (/sat\w*\s*:?\s*closed|closed\s*(?:on\s*)?sat/.test(t)) closed.add(6);
  return [...closed].sort();
}

/** Best-effort read of a clinic's free-text hours. Never throws. */
export function parseClinicHours(text: string | null | undefined): ClinicHours {
  if (!text || !text.trim()) return DEFAULT_HOURS;
  if (/24\s*(?:hours|hrs|\/\s*7)/i.test(text)) {
    // Round-the-clock clinics still get a daytime grid — nobody books 3 AM skin visits.
    return { openMin: 8 * 60, closeMin: 20 * 60, closedDays: [], parsed: true };
  }

  const hits: Hit[] = [];
  for (const m of text.matchAll(TIME_RE)) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h > 23 || min > 59) continue;
    const merRaw = m[3]?.toLowerCase().replace(/\./g, "") ?? null;
    hits.push({ h, m: min, mer: merRaw === "am" || merRaw === "pm" ? merRaw : null });
  }
  if (hits.length < 2) return DEFAULT_HOURS;

  const [a, b] = hits;
  let open = toMinutes(a);
  let close = toMinutes(b);
  // "9-5" with no meridiem → afternoon close.
  if (b.mer === null && close <= open && close + 12 * 60 > open) close += 12 * 60;
  if (a.mer === null && open < 6 * 60) open += 12 * 60;

  const sane = open >= 5 * 60 && close <= 23 * 60 && close - open >= 60;
  if (!sane) return { ...DEFAULT_HOURS, closedDays: closedDaysFrom(text) };
  return { openMin: open, closeMin: close, closedDays: closedDaysFrom(text), parsed: true };
}

/** Local midnight of `d`. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Every 30-minute slot start for `day` within the clinic's hours (past times included). */
export function slotsForDay(day: Date, hours: ClinicHours): Date[] {
  if (hours.closedDays.includes(day.getDay())) return [];
  const base = startOfDay(day);
  const out: Date[] = [];
  // Round the opening time up to the slot grid.
  const first = Math.ceil(hours.openMin / SLOT_MINUTES) * SLOT_MINUTES;
  for (let min = first; min + SLOT_MINUTES <= hours.closeMin; min += SLOT_MINUTES) {
    const d = new Date(base);
    d.setMinutes(min);
    out.push(d);
  }
  return out;
}

/** Slots on `day` that start after `now`. */
export function openSlotsForDay(day: Date, hours: ClinicHours, now: Date = new Date()): Date[] {
  return slotsForDay(day, hours).filter((s) => s.getTime() > now.getTime());
}

/** The next `count` calendar days starting today. */
export function upcomingDays(count = BOOKING_WINDOW_DAYS, now: Date = new Date()): Date[] {
  const today = startOfDay(now);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

/** First day in the window that still has a bookable slot (falls back to tomorrow). */
export function firstOpenDay(hours: ClinicHours, now: Date = new Date()): Date {
  const days = upcomingDays(BOOKING_WINDOW_DAYS, now);
  return days.find((d) => openSlotsForDay(d, hours, now).length > 0) ?? days[1];
}

export function formatMinutes(min: number): string {
  const d = new Date(2000, 0, 1, Math.floor(min / 60), min % 60);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatSlotTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Thu, Nov 12" */
export function formatSlotDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
