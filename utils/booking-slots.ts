/**
 * Booking slot helpers for the patient appointment picker.
 *
 * Clinic hours are free text in the `clinics` table ("Mon–Sat 9:00 AM – 5:00 PM", "9am-6pm", …).
 * We read what we safely can from them, per weekday, and fall back to a 9 AM – 5 PM day, so the
 * picker always offers sensible 30-minute slots. The doctor still confirms the exact time.
 */
/** Matches SLOT_MINUTES in lib/db/appointments and appointment_slot_length() on the server. Kept
 * local so this module stays free of the Supabase client (unit-testable). */
const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;

export type DayHours = {
  /** Minutes after midnight the first slot can start. */
  openMin: number;
  /** Minutes after midnight the clinic closes (last slot ends here). */
  closeMin: number;
};

export type ClinicHours = DayHours & {
  /** Hours per weekday (index 0 = Sunday); null = closed that day. The top-level openMin /
   * closeMin are the earliest opening and latest closing across the week. */
  byDay: (DayHours | null)[];
  /** Weekdays (0 = Sunday) with no slots. */
  closedDays: number[];
  /** True when the hours came from the clinic's own text, not the fallback. */
  parsed: boolean;
};

const DEFAULT_DAY: DayHours = { openMin: 9 * 60, closeMin: 17 * 60 };

export const DEFAULT_HOURS: ClinicHours = {
  ...DEFAULT_DAY,
  byDay: Array.from({ length: 7 }, () => DEFAULT_DAY),
  closedDays: [],
  parsed: false,
};

/** How many days ahead the patient can pick from. */
export const BOOKING_WINDOW_DAYS = 14;

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY = "\\b(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*\\.?";
const SEP = "\\s*(?:-|–|—|\\bto\\b|\\bthru\\b|\\bthrough\\b|\\buntil\\b|\\btill\\b)\\s*";
const TIME = "(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?|nn|noon)?";
const TIME_RANGE_RE = new RegExp(`^${TIME}${SEP}${TIME}$`, "i");

/**
 * One left-to-right pass over the text. Alternation order matters: "7 days" must win over a bare
 * "7", and a day range over a single day.
 */
const TOKEN_RE = new RegExp(
  [
    "(?<all>\\b(?:daily|everyday|every\\s*day|7\\s*days(?:\\s*a\\s*week)?)\\b)",
    "(?<weekdays>\\bweekdays?\\b)",
    "(?<weekends>\\bweekends?\\b)",
    `(?<times>${TIME}${SEP}${TIME})`,
    `(?<dayRange>${DAY}${SEP}${DAY})`,
    `(?<day>${DAY})`,
    "(?<closed>\\bclosed\\b)",
  ].join("|"),
  "gi",
);

type Mer = "am" | "pm" | null;
type Hit = { h: number; m: number; mer: Mer };

function toMinutes({ h, m, mer }: Hit): number {
  if (mer === null) return h * 60 + m; // 24h or bare hour, fixed up by the caller
  return ((h % 12) + (mer === "pm" ? 12 : 0)) * 60 + m;
}

function readMer(raw: string | undefined): Mer {
  const v = raw?.toLowerCase().replace(/\./g, "");
  if (v === "am") return "am";
  if (v === "pm" || v === "nn" || v === "noon") return "pm";
  return null;
}

/** "9:00 AM – 5:00 PM", "9-5", "1-8pm", "08:30-17:30" → minutes, or null when it isn't a sane day. */
function readRange(text: string): DayHours | null {
  const m = text.match(TIME_RANGE_RE);
  if (!m) return null;
  const a: Hit = { h: Number(m[1]), m: Number(m[2] ?? 0), mer: readMer(m[3]) };
  const b: Hit = { h: Number(m[4]), m: Number(m[5] ?? 0), mer: readMer(m[6]) };
  if (a.h > 23 || b.h > 23 || a.m > 59 || b.m > 59) return null;
  let open = toMinutes(a);
  let close = toMinutes(b);
  // "9-5" with no meridiem → afternoon close.
  if (b.mer === null && close <= open && close + 12 * 60 > open) close += 12 * 60;
  // "1-8pm" → 1 PM open.
  if (a.mer === null && open < 6 * 60) open += 12 * 60;
  const sane = open >= 5 * 60 && close <= 23 * 60 && close - open >= 60;
  return sane ? { openMin: open, closeMin: close } : null;
}

function dayIndex(name: string): number {
  return DAY_NAMES.indexOf(name.trim().slice(0, 3).toLowerCase());
}

/** Inclusive weekday range; "Tue–Sun" wraps through the week. */
function dayRange(from: number, to: number): number[] {
  if (from < 0 || to < 0) return [];
  const out: number[] = [];
  for (let d = from; out.length < 7; d = (d + 1) % 7) {
    out.push(d);
    if (d === to) break;
  }
  return out;
}

type Item =
  { kind: "days"; days: number[] } | { kind: "time"; hours: DayHours | null } | { kind: "closed" };

function tokenize(text: string): Item[] {
  const items: Item[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const g = m.groups ?? {};
    let item: Item;
    if (g.all) item = { kind: "days", days: [0, 1, 2, 3, 4, 5, 6] };
    else if (g.weekdays) item = { kind: "days", days: [1, 2, 3, 4, 5] };
    else if (g.weekends) item = { kind: "days", days: [0, 6] };
    else if (g.times) item = { kind: "time", hours: readRange(g.times) };
    else if (g.dayRange) {
      const [from, to] = g.dayRange.split(new RegExp(SEP, "i"));
      item = { kind: "days", days: dayRange(dayIndex(from), dayIndex(to)) };
    } else if (g.day) item = { kind: "days", days: [dayIndex(g.day)].filter((d) => d >= 0) };
    else item = { kind: "closed" };

    // "Mon, Wed & Fri" → one group of days.
    const last = items[items.length - 1];
    if (item.kind === "days" && last?.kind === "days") {
      last.days = [...new Set([...last.days, ...item.days])];
    } else {
      items.push(item);
    }
  }
  return items;
}

/**
 * Best-effort read of a clinic's free-text hours, per weekday. Never throws.
 *
 * Handles "Mon–Sat, 9:00 AM – 5:00 PM", "Mon-Fri 9AM-5PM, Sat 9AM-12NN", "9am-6pm, Sunday closed",
 * "Closed on Sundays", "Tue–Sun 10-7", "Daily 8am-5pm" and time-first text like "9-5 Mon-Sat".
 */
export function parseClinicHours(text: string | null | undefined): ClinicHours {
  if (!text || !text.trim()) return DEFAULT_HOURS;
  if (/24\s*(?:hours|hrs|\/\s*7)/i.test(text)) {
    // Round-the-clock clinics still get a daytime grid — nobody books 3 AM skin visits.
    return build(
      Array.from({ length: 7 }, () => ({ openMin: 8 * 60, closeMin: 20 * 60 })),
      true,
    );
  }

  const items = tokenize(text);
  // undefined = not mentioned, null = closed.
  const byDay: (DayHours | null | undefined)[] = Array(7).fill(undefined);
  let general: DayHours | null = null;
  let sawTime = false;
  let readTime = false;
  const openNoTime: number[] = [];

  const noteTime = (it: Item | undefined) => {
    if (it?.kind !== "time") return;
    sawTime = true;
    if (it.hours) readTime = true;
  };
  const assign = (days: number[], value: Item) => {
    for (const d of days) {
      if (value.kind === "closed") byDay[d] = null;
      else if (value.kind === "time" && value.hours) byDay[d] = value.hours;
    }
  };

  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const next = items[i + 1];
    const after = items[i + 2];
    noteTime(cur);
    if (cur.kind === "days" && next && next.kind !== "days") {
      // "Mon-Fri 9-5", "Sunday closed"
      noteTime(next);
      assign(cur.days, next);
      i++;
    } else if (
      next?.kind === "days" &&
      (cur.kind === "closed" ||
        (cur.kind === "time" && after?.kind !== "time" && after?.kind !== "closed"))
    ) {
      // "Closed on Sundays, 8am-6pm", "9-5 Mon-Sat"
      assign(next.days, cur);
      i++;
    } else if (cur.kind === "time") {
      // Hours for every day not named elsewhere ("9am-6pm, Sunday closed").
      if (cur.hours && !general) general = cur.hours;
    } else if (cur.kind === "days") {
      openNoTime.push(...cur.days);
    }
  }

  if (sawTime && !readTime) {
    // Times we couldn't make sense of ("11pm - 2am") — fall back, but keep the closed days.
    return build(
      byDay.map((h) => (h === null ? null : DEFAULT_DAY)),
      false,
    );
  }

  const namedSomeDay = byDay.some((h) => h != null) || openNoTime.length > 0;
  const resolved = byDay.map((h, d) => {
    if (h !== undefined) return h;
    if (openNoTime.includes(d)) return general ?? DEFAULT_DAY;
    // Days nobody mentioned: open on the general hours, or closed when the text lists specific
    // days ("Mon–Sat 9–5" → Sunday closed).
    if (general) return general;
    return namedSomeDay ? null : DEFAULT_DAY;
  });
  return build(resolved, readTime);
}

function build(byDay: (DayHours | null)[], parsed: boolean): ClinicHours {
  const open = byDay.filter((h): h is DayHours => h !== null);
  if (open.length === 0) return DEFAULT_HOURS;
  return {
    openMin: Math.min(...open.map((h) => h.openMin)),
    closeMin: Math.max(...open.map((h) => h.closeMin)),
    byDay,
    closedDays: byDay.flatMap((h, d) => (h === null ? [d] : [])),
    parsed,
  };
}

/** The clinic's hours on `day`'s weekday, or null when it's closed. */
export function hoursForDay(day: Date, hours: ClinicHours): DayHours | null {
  return hours.byDay[day.getDay()] ?? null;
}

/** Local midnight of `d`. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Every 30-minute slot start for `day` within the clinic's hours that day (past times included). */
export function slotsForDay(day: Date, hours: ClinicHours): Date[] {
  const today = hoursForDay(day, hours);
  if (!today) return [];
  const base = startOfDay(day);
  const out: Date[] = [];
  // Round the opening time up to the slot grid.
  const first = Math.ceil(today.openMin / SLOT_MINUTES) * SLOT_MINUTES;
  for (let min = first; min + SLOT_MINUTES <= today.closeMin; min += SLOT_MINUTES) {
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

/* ---------- The patient's own bookings ---------- */

/** The fields of an appointment row the own-conflict rules need. */
export type OwnBooking = {
  id: string;
  clinic_id: string;
  status: string;
  preferred_time: string | null;
  scheduled_at: string | null;
};

export type OwnConflict =
  /** A request at this clinic is still waiting on the doctor. */
  | { kind: "pending_here"; row: OwnBooking }
  /** Another of the patient's visits / requests sits within 30 minutes of the picked time. */
  | { kind: "overlap"; row: OwnBooking; at: Date }
  | null;

const PENDING = new Set(["requested", "needs_reschedule"]);

/** The time an active booking holds: the confirmed time, else the requested one. Null when none. */
function heldTime(row: OwnBooking): Date | null {
  const iso =
    row.status === "scheduled"
      ? row.scheduled_at
      : PENDING.has(row.status)
        ? row.preferred_time
        : null;
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** Upcoming times the patient already holds (their own confirmed visits and pending requests). */
export function ownBusyTimes(
  rows: OwnBooking[],
  now: Date = new Date(),
  excludeId?: string,
): Date[] {
  return rows
    .filter((r) => r.id !== excludeId)
    .map(heldTime)
    .filter((t): t is Date => t !== null && t.getTime() + SLOT_MS > now.getTime());
}

/**
 * Mirrors the server rules (0018 migration): one pending request per clinic, and no two of the
 * patient's own visits / requests within 30 minutes of each other. `excludeId` skips the row being
 * rescheduled.
 */
export function findOwnConflict(
  rows: OwnBooking[],
  clinicId: string,
  at: Date | null,
  opts: { now?: Date; excludeId?: string } = {},
): OwnConflict {
  const now = opts.now ?? new Date();
  const others = rows.filter((r) => r.id !== opts.excludeId);
  if (!opts.excludeId) {
    const pending = others.find((r) => r.clinic_id === clinicId && PENDING.has(r.status));
    if (pending) return { kind: "pending_here", row: pending };
  }
  if (!at) return null;
  for (const r of others) {
    const t = heldTime(r);
    if (!t || t.getTime() + SLOT_MS <= now.getTime()) continue;
    if (Math.abs(t.getTime() - at.getTime()) < SLOT_MS) return { kind: "overlap", row: r, at: t };
  }
  return null;
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
