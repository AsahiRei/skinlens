import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { Text } from "@/components/Text";
import { theme } from "@/lib/theme";
import { getTakenSlots, overlapsTakenSlot, SLOT_MINUTES } from "@/lib/db/appointments";
import {
  firstOpenDay,
  formatMinutes,
  formatSlotTime,
  hoursForDay,
  isSameDay,
  openSlotsForDay,
  parseClinicHours,
  slotsForDay,
  startOfDay,
  upcomingDays,
} from "@/utils/booking-slots";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY: Date[] = [];

type Period = { key: string; label: string; from: number; to: number };
const PERIODS: Period[] = [
  { key: "am", label: "Morning", from: 0, to: 12 * 60 },
  { key: "pm", label: "Afternoon", from: 12 * 60, to: 17 * 60 },
  { key: "eve", label: "Evening", from: 17 * 60, to: 24 * 60 },
];

/**
 * Day strip + 30-minute slot grid for a patient's preferred visit time.
 *
 * - Days come from the next two weeks; closed days (read from the clinic's hours text) are disabled.
 * - Times already confirmed — or already requested by another patient (first come, first served) —
 *   for the chosen doctor (or with no doctor left when "first available") are shown as booked and
 *   can't be picked. The server re-checks on save.
 * - The patient's own visits / pending requests (`ownTimes`) are blocked too — nobody can be in two
 *   places within 30 minutes.
 * - Bump `refreshKey` to refetch the booked times (e.g. after the server rejected a slot).
 * - Tapping the selected slot again clears it (the request then says "any time").
 *
 * Doctor mode (`viewer="doctor"`): the caller passes `bookedTimes` (the doctor's confirmed visits,
 * computed from the queue they already have) so no lookup runs, `heldTimes` (other patients'
 * pending requests — still pickable, just flagged) and `requestedAt` (this patient's ask).
 */
export function AppointmentSlotPicker({
  clinicId,
  doctorId,
  hoursText,
  value,
  onChange,
  ownTimes = EMPTY,
  refreshKey = 0,
  excludeId = null,
  viewer = "patient",
  windowDays,
  bookedTimes,
  heldTimes = EMPTY,
  requestedAt = null,
}: {
  clinicId: string;
  doctorId: string | null;
  hoursText?: string | null;
  value: Date | null;
  onChange: (d: Date | null) => void;
  /** Times the patient already holds elsewhere (their own visits / requests). */
  ownTimes?: Date[];
  refreshKey?: number;
  /** The request being rescheduled — its own current time doesn't count as taken. */
  excludeId?: string | null;
  viewer?: "patient" | "doctor";
  /** Days shown in the strip (defaults to the patient booking window). */
  windowDays?: number;
  /** Known unavailable times — skips the server lookup when given. */
  bookedTimes?: Date[];
  /** Times another pending request asks for: flagged, but still pickable. */
  heldTimes?: Date[];
  /** The time this patient asked for — marked in the grid. */
  requestedAt?: Date | null;
}) {
  const isDoctor = viewer === "doctor";
  const external = bookedTimes !== undefined;
  const hours = useMemo(() => parseClinicHours(hoursText), [hoursText]);
  // Captured once per mount: the strip doesn't need to roll over at midnight while open.
  const [now] = useState(() => new Date());
  const days = useMemo(() => upcomingDays(windowDays, now), [windowDays, now]);
  const [day, setDay] = useState<Date>(() =>
    value ? startOfDay(value) : firstOpenDay(hours, now),
  );
  // Follow a value set from outside (e.g. "Use requested time") onto its day.
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    if (value && !isSameDay(value, day)) setDay(startOfDay(value));
  }

  // Taken times for the visible day, tagged with the lookup they answer.
  const takenKey = `${clinicId}|${doctorId ?? ""}|${day.toDateString()}|${refreshKey}`;
  const [taken, setTaken] = useState<{ key: string; slots: Date[] } | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (external) return;
    let active = true;
    const from = startOfDay(day);
    const to = new Date(from.getTime() + DAY_MS - 1);
    getTakenSlots(clinicId, doctorId, from, to, excludeId)
      .catch(() => [] as Date[]) // the server still blocks a taken slot on save
      .then((slots) => {
        if (!active) return;
        setTaken({ key: takenKey, slots });
        // A doctor switch can make the already-picked time unavailable.
        const v = valueRef.current;
        if (v && isSameDay(v, day) && overlapsTakenSlot(v, slots)) onChangeRef.current(null);
      });
    return () => {
      active = false;
    };
  }, [clinicId, doctorId, day, takenKey, excludeId, external]);

  const takenSlots = bookedTimes ?? (taken?.key === takenKey ? taken.slots : []);
  const checking = !external && taken?.key !== takenKey;
  const slots = openSlotsForDay(day, hours, new Date());
  const closed = hours.closedDays.includes(day.getDay());
  const dayHours = hoursForDay(day, hours);
  const dayHadSlots = slotsForDay(day, hours).length > 0;

  const monthLabel = day.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <View className="flex-col gap-4">
      {/* Month + hours */}
      <View className="flex-row items-center justify-between">
        <Text className="text-[15px] font-bold" style={{ color: theme.colors.ink }}>
          {monthLabel}
        </Text>
        <Text className="text-xs" style={{ color: theme.colors.muted }}>
          {dayHours
            ? `${formatMinutes(dayHours.openMin)} – ${formatMinutes(dayHours.closeMin)}`
            : "Closed"}
        </Text>
      </View>

      {/* Day strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 4 }}
      >
        {days.map((d) => {
          const isClosed = hours.closedDays.includes(d.getDay());
          const noneLeft = !isClosed && openSlotsForDay(d, hours, now).length === 0;
          const disabled = isClosed || noneLeft;
          const selected = isSameDay(d, day);
          const hasPick = value !== null && isSameDay(d, value);
          const hasRequest = requestedAt !== null && isSameDay(d, requestedAt);
          const isToday = isSameDay(d, now);
          return (
            <Pressable
              key={d.toDateString()}
              onPress={() => setDay(d)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${d.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}${isClosed ? ", closed" : noneLeft ? ", no times left" : ""}`}
              className="items-center justify-center rounded-2xl active:opacity-80"
              style={{
                width: 54,
                paddingVertical: 10,
                backgroundColor: selected ? theme.colors.primary : theme.colors.card,
                borderWidth: 1,
                borderColor: selected ? theme.colors.primary : theme.colors.cardBorder,
                opacity: disabled ? 0.45 : 1,
              }}
            >
              <Text
                className="text-[10px] font-bold uppercase"
                style={{
                  letterSpacing: 0.6,
                  color: selected ? "rgba(255,255,255,0.8)" : theme.colors.muted,
                }}
              >
                {isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" })}
              </Text>
              <Text
                className="text-[19px] font-bold mt-0.5"
                style={{ color: selected ? "#FFFFFF" : theme.colors.ink }}
              >
                {d.getDate()}
              </Text>
              <View
                className="mt-1 rounded-full"
                style={{
                  width: 5,
                  height: 5,
                  backgroundColor: hasPick
                    ? selected
                      ? "#FFFFFF"
                      : theme.colors.primary
                    : hasRequest
                      ? theme.colors.star
                      : "transparent",
                }}
              />
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Slots */}
      {closed ? (
        <EmptySlots copy="The clinic is closed on this day. Pick another date." />
      ) : slots.length === 0 ? (
        <EmptySlots
          copy={
            dayHadSlots
              ? "No times left today. Pick another date."
              : "No open times on this day. Pick another date."
          }
        />
      ) : (
        <View className="flex-col gap-4">
          {PERIODS.map((p) => {
            const inPeriod = slots.filter((s) => {
              const m = s.getHours() * 60 + s.getMinutes();
              return m >= p.from && m < p.to;
            });
            if (inPeriod.length === 0) return null;
            return (
              <View key={p.key} className="flex-col gap-2">
                <Text
                  className="text-[11px] font-bold uppercase"
                  style={{ color: theme.colors.muted, letterSpacing: 0.8 }}
                >
                  {p.label}
                </Text>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {inPeriod.map((s) => {
                    const isMine = overlapsTakenSlot(s, ownTimes);
                    const isTaken = isMine || overlapsTakenSlot(s, takenSlots);
                    const selected = value !== null && value.getTime() === s.getTime();
                    const isRequested = !isTaken && requestedAt !== null && inSlot(requestedAt, s);
                    const isHeld = !isTaken && !isRequested && overlapsTakenSlot(s, heldTimes);
                    const caption = isRequested ? "Requested" : isHeld ? "Other request" : null;
                    return (
                      <Pressable
                        key={s.getTime()}
                        disabled={isTaken}
                        onPress={() => onChange(selected ? null : s)}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: isTaken }}
                        accessibilityLabel={`${formatSlotTime(s)}${
                          isMine
                            ? isDoctor
                              ? ", patient has another visit then"
                              : ", you have a visit then"
                            : isTaken
                              ? ", booked"
                              : isRequested
                                ? ", the patient's requested time"
                                : isHeld
                                  ? ", another patient requested this time"
                                  : ""
                        }`}
                        className="items-center justify-center rounded-xl active:opacity-80"
                        style={{
                          width: "31.3%",
                          paddingVertical: caption ? 6 : 11,
                          minHeight: 44,
                          backgroundColor: selected
                            ? theme.colors.primary
                            : isTaken
                              ? "#F3F4F6"
                              : isRequested || isHeld
                                ? theme.colors.warningBg
                                : theme.colors.card,
                          borderWidth: isRequested && !selected ? 1.5 : 1,
                          borderColor: selected
                            ? theme.colors.primary
                            : isTaken
                              ? "#F3F4F6"
                              : isRequested
                                ? theme.colors.star
                                : isHeld
                                  ? theme.colors.warningBorder
                                  : theme.colors.cardBorder,
                        }}
                      >
                        <Text
                          className="text-[13px] font-semibold"
                          style={{
                            color: selected
                              ? "#FFFFFF"
                              : isTaken
                                ? theme.colors.faint
                                : theme.colors.ink,
                            textDecorationLine: isTaken ? "line-through" : "none",
                          }}
                        >
                          {formatSlotTime(s)}
                        </Text>
                        {caption ? (
                          <Text
                            className="text-[9px] font-bold uppercase"
                            numberOfLines={1}
                            style={{
                              letterSpacing: 0.4,
                              color: selected ? "rgba(255,255,255,0.85)" : theme.colors.warningText,
                            }}
                          >
                            {caption}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Legend — patients only; in doctor mode slots carry their own captions */}
      {isDoctor ? null : (
        <View className="flex-row items-center gap-4">
          <Legend color={theme.colors.card} border={theme.colors.cardBorder} label="Open" />
          <Legend color={theme.colors.primary} label="Selected" />
          <Legend color="#E5E7EB" label="Booked" />
          <View className="flex-1" />
          {checking ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
        </View>
      )}
      {!hours.parsed ? (
        <Text
          className="text-[11px]"
          style={{ color: theme.colors.faint, marginTop: isDoctor ? 0 : -8 }}
        >
          {isDoctor
            ? "Your clinic's hours aren't set, so typical hours are shown."
            : "Showing typical clinic hours. The doctor confirms your exact time."}
        </Text>
      ) : null}
    </View>
  );
}

/** `at` falls inside the 30-minute slot starting at `slot`. */
function inSlot(at: Date, slot: Date): boolean {
  const diff = at.getTime() - slot.getTime();
  return diff >= 0 && diff < SLOT_MINUTES * 60 * 1000;
}

function EmptySlots({ copy }: { copy: string }) {
  return (
    <View
      className="items-center rounded-2xl px-4 py-5"
      style={{ backgroundColor: theme.colors.background }}
    >
      <Text className="text-[13px] text-center" style={{ color: theme.colors.muted }}>
        {copy}
      </Text>
    </View>
  );
}

function Legend({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View
        className="rounded"
        style={{
          width: 10,
          height: 10,
          backgroundColor: color,
          borderWidth: border ? 1 : 0,
          borderColor: border,
        }}
      />
      <Text className="text-[11px]" style={{ color: theme.colors.muted }}>
        {label}
      </Text>
    </View>
  );
}
