import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_HOURS,
  findOwnConflict,
  ownBusyTimes,
  type OwnBooking,
  firstOpenDay,
  openSlotsForDay,
  parseClinicHours,
  slotsForDay,
  upcomingDays,
} from "@/utils/booking-slots";

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

describe("parseClinicHours", () => {
  it("falls back to 9–5 for empty or unreadable text", () => {
    expect(parseClinicHours("")).toEqual(DEFAULT_HOURS);
    expect(parseClinicHours(null)).toEqual(DEFAULT_HOURS);
    expect(parseClinicHours("By appointment")).toEqual(DEFAULT_HOURS);
  });

  it.each([
    ["Mon–Sat 9:00 AM – 5:00 PM", "9:00", "17:00", [0]],
    ["9am-6pm", "9:00", "18:00", []],
    ["Mon-Fri 08:30-17:30", "8:30", "17:30", [0, 6]],
    ["10:00 AM to 7:00 PM, Sunday closed", "10:00", "19:00", [0]],
    ["9-5", "9:00", "17:00", []],
    ["1-8pm", "13:00", "20:00", []],
  ])("reads %s", (text, open, close, closed) => {
    const h = parseClinicHours(text);
    expect(h.parsed).toBe(true);
    expect(hm(h.openMin)).toBe(open);
    expect(hm(h.closeMin)).toBe(close);
    expect(h.closedDays).toEqual(closed);
  });

  it("rejects nonsense ranges", () => {
    expect(parseClinicHours("11pm - 2am").parsed).toBe(false);
  });
});

describe("slots", () => {
  const hours = parseClinicHours("9:00 AM - 11:00 AM");
  const thu = new Date(2026, 10, 12); // Thursday

  it("builds 30-minute slots that end by closing", () => {
    expect(slotsForDay(thu, hours).map((d) => hm(d.getHours() * 60 + d.getMinutes()))).toEqual([
      "9:00",
      "9:30",
      "10:00",
      "10:30",
    ]);
  });

  it("has no slots on closed days", () => {
    const sun = new Date(2026, 10, 15);
    expect(slotsForDay(sun, parseClinicHours("Mon-Sat 9am-5pm"))).toEqual([]);
  });

  it("hides slots that already started", () => {
    const now = new Date(2026, 10, 12, 9, 45);
    expect(openSlotsForDay(thu, hours, now)).toHaveLength(2);
  });

  it("skips to the next open day when today is over", () => {
    const late = new Date(2026, 10, 12, 18, 0);
    expect(firstOpenDay(hours, late).getDate()).toBe(13);
    expect(upcomingDays(14, late)).toHaveLength(14);
  });
});

describe("parseClinicHours per day", () => {
  const day = (h: ReturnType<typeof parseClinicHours>, d: number) => {
    const x = h.byDay[d];
    return x ? `${hm(x.openMin)}-${hm(x.closeMin)}` : "closed";
  };

  it("keeps a Saturday half-day instead of closing it", () => {
    const h = parseClinicHours("Mon-Fri 9AM-5PM, Sat 9AM-12NN");
    expect(h.parsed).toBe(true);
    expect(day(h, 1)).toBe("9:00-17:00");
    expect(day(h, 6)).toBe("9:00-12:00");
    expect(h.closedDays).toEqual([0]);
  });

  it("reads closed-first and time-first text", () => {
    expect(parseClinicHours("Closed on Sundays, 8am-6pm").closedDays).toEqual([0]);
    const h = parseClinicHours("9-5 Mon-Sat");
    expect(day(h, 3)).toBe("9:00-17:00");
    expect(h.closedDays).toEqual([0]);
  });

  it("wraps day ranges through the week", () => {
    expect(parseClinicHours("Tue–Sun 10-7").closedDays).toEqual([1]);
  });

  it("doesn't read '7 days' as an opening hour", () => {
    const h = parseClinicHours("Open 7 days, 8am-6pm");
    expect(day(h, 0)).toBe("8:00-18:00");
    expect(h.closedDays).toEqual([]);
  });

  it("lists days with their own hours", () => {
    const h = parseClinicHours("Mon, Wed & Fri 1-6pm");
    expect(h.closedDays).toEqual([0, 2, 4, 6]);
    expect(day(h, 3)).toBe("13:00-18:00");
  });

  it("builds slots from that weekday's hours", () => {
    const sat = new Date(2026, 10, 14);
    const h = parseClinicHours("Mon-Fri 9AM-5PM, Sat 9AM-11AM");
    expect(slotsForDay(sat, h)).toHaveLength(4);
  });
});

describe("findOwnConflict", () => {
  const now = new Date(2026, 10, 12, 8, 0);
  const at = (h: number, m = 0) => new Date(2026, 10, 13, h, m);
  const row = (o: Partial<OwnBooking>): OwnBooking => ({
    id: "r1",
    clinic_id: "c1",
    status: "requested",
    preferred_time: null,
    scheduled_at: null,
    ...o,
  });

  it("blocks a second pending request at the same clinic", () => {
    expect(findOwnConflict([row({})], "c1", null, { now })?.kind).toBe("pending_here");
    expect(findOwnConflict([row({ status: "declined" })], "c1", null, { now })).toBeNull();
  });

  it("blocks a time within 30 minutes of the patient's own visit elsewhere", () => {
    const visit = row({
      clinic_id: "c2",
      status: "scheduled",
      scheduled_at: at(10).toISOString(),
    });
    expect(findOwnConflict([visit], "c1", at(10, 0), { now })?.kind).toBe("overlap");
    expect(findOwnConflict([visit], "c1", at(10, 30), { now })).toBeNull();
    expect(ownBusyTimes([visit], now)).toHaveLength(1);
  });

  it("ignores the row being rescheduled", () => {
    const self = row({ status: "needs_reschedule", preferred_time: at(10).toISOString() });
    expect(findOwnConflict([self], "c1", at(10), { now, excludeId: "r1" })).toBeNull();
  });
});
