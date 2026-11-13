import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_HOURS,
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
