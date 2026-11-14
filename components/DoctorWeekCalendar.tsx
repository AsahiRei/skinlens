import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { Text } from "@/components/Text";
import { ClinicalCard } from "@/components/ui";
import { theme } from "@/lib/theme";

const WEEK_LETTERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday of the week containing `base` (local time, day precision). */
export function startOfWeekMonday(base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Week strip for the Schedule tab: browse week by week, each day shows how many visits it has and
 * an amber dot when a pending request asks for it. Closed clinic days are dimmed.
 */
export function DoctorWeekCalendar({
  selectedDay,
  onSelect,
  visitCounts,
  requestDayKeys,
  closedDays = [],
}: {
  selectedDay: Date;
  onSelect: (day: Date) => void;
  /** dayKey → number of scheduled visits. */
  visitCounts: Map<string, number>;
  requestDayKeys?: Set<string>;
  /** Weekdays (0 = Sunday) the clinic is closed. */
  closedDays?: number[];
}) {
  const [today] = useState(() => new Date());
  // The strip follows the selected day's week; arrows move the selection by a week.
  const monday = useMemo(() => startOfWeekMonday(selectedDay), [selectedDay]);
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
      }),
    [monday],
  );

  const label = selectedDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const onThisWeek = sameDay(monday, startOfWeekMonday(today));

  const shift = (days: number) => {
    const d = new Date(selectedDay);
    d.setDate(d.getDate() + days);
    onSelect(d);
  };

  return (
    <ClinicalCard className="flex-col gap-3" style={{ paddingHorizontal: 12 }}>
      <View className="flex-row items-center gap-2 px-1">
        <Text className="font-bold text-[16px] flex-1" style={{ color: theme.colors.ink }}>
          {label}
        </Text>
        {!sameDay(selectedDay, today) ? (
          <Pressable
            onPress={() => onSelect(today)}
            accessibilityRole="button"
            accessibilityLabel="Jump to today"
            hitSlop={6}
            className="rounded-full px-3 py-1.5 active:opacity-70"
            style={{ backgroundColor: theme.colors.primarySoft }}
          >
            <Text className="text-xs font-bold" style={{ color: theme.colors.primaryDeep }}>
              Today
            </Text>
          </Pressable>
        ) : null}
        <NavButton
          label="Previous week"
          onPress={() => shift(-7)}
          disabled={onThisWeek}
          icon={<ChevronLeft size={18} color={theme.colors.ink} />}
        />
        <NavButton
          label="Next week"
          onPress={() => shift(7)}
          icon={<ChevronRight size={18} color={theme.colors.ink} />}
        />
      </View>

      <View className="flex-row" style={{ gap: 4 }}>
        {week.map((day, i) => {
          const selected = sameDay(day, selectedDay);
          const isToday = sameDay(day, today);
          const closed = closedDays.includes(day.getDay());
          const count = visitCounts.get(dayKey(day)) ?? 0;
          const hasRequest = requestDayKeys?.has(dayKey(day)) ?? false;
          return (
            <Pressable
              key={dayKey(day)}
              onPress={() => onSelect(day)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${day.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}, ${count} ${count === 1 ? "visit" : "visits"}${hasRequest ? ", has requests" : ""}${
                closed ? ", clinic closed" : ""
              }`}
              className="flex-1 items-center rounded-2xl py-2.5 active:opacity-80"
              style={{
                backgroundColor: selected ? theme.colors.primary : "transparent",
                borderWidth: 1,
                borderColor: selected
                  ? theme.colors.primary
                  : isToday
                    ? theme.colors.primary
                    : "transparent",
                opacity: closed && !selected ? 0.45 : 1,
              }}
            >
              <Text
                className="text-[10px] font-bold uppercase"
                style={{
                  letterSpacing: 0.4,
                  color: selected ? "rgba(255,255,255,0.8)" : theme.colors.muted,
                }}
              >
                {WEEK_LETTERS[i]}
              </Text>
              <Text
                className="text-[17px] font-bold mt-0.5"
                style={{ color: selected ? "#FFFFFF" : theme.colors.ink }}
              >
                {day.getDate()}
              </Text>
              <View className="flex-row items-center gap-0.5 mt-1" style={{ height: 14 }}>
                {count > 0 ? (
                  <Text
                    className="text-[11px] font-semibold"
                    style={{ color: selected ? "rgba(255,255,255,0.85)" : theme.colors.primary }}
                  >
                    {count}
                  </Text>
                ) : null}
                {hasRequest ? (
                  <View
                    className="rounded-full"
                    style={{ width: 6, height: 6, backgroundColor: theme.colors.star }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ClinicalCard>
  );
}

function NavButton({
  label,
  onPress,
  icon,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={4}
      className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
      style={{
        backgroundColor: theme.colors.background,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {icon}
    </Pressable>
  );
}
