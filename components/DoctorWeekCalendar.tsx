import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CalendarCheck2 } from "lucide-react-native";

import { theme, cardShadow } from "@/lib/theme";

const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** Monday of the week containing `base` (local time, day precision). */
function startOfWeekMonday(base: Date): Date {
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
 * Dark-green week strip (matches the tab bar gradient). Tap a day to
 * filter, tap again (or the pill) to clear. Dots mark days that have at
 * least one confirmed visit.
 */
export function DoctorWeekCalendar({
  selectedDay,
  onSelect,
  visitDayKeys,
}: {
  selectedDay: Date | null;
  onSelect: (day: Date | null) => void;
  visitDayKeys: Set<string>;
}) {
  const week = useMemo(() => {
    const monday = startOfWeekMonday(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);

  const weekLabel = useMemo(() => {
    const start = week[0];
    const end = week[6];
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleString("en-US", { month: "long" })} ${start.getFullYear()}`;
    }
    return `${start.toLocaleString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleString("en-US", { month: "short", day: "numeric" })}, ${end.getFullYear()}`;
  }, [week]);

  const selectedLabel = selectedDay
    ? selectedDay.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const today = new Date();

  return (
    <LinearGradient
      colors={[...theme.gradients.dark]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      className="mt-4 px-4 py-4"
      style={{ borderRadius: theme.radius.card, ...cardShadow }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <CalendarCheck2 size={16} color="#FFFFFF" />
          <Text className="font-bold text-[15px] text-white">{weekLabel}</Text>
        </View>
        {selectedDay ? (
          <Pressable
            onPress={() => onSelect(null)}
            accessibilityRole="button"
            accessibilityLabel="Clear selected day"
            hitSlop={8}
            className="rounded-full px-3 py-1.5 active:opacity-70"
            style={{ backgroundColor: "rgba(255,255,255,0.22)" }}
          >
            <Text className="text-[11px] font-bold text-white">
              {selectedLabel} ✕
            </Text>
          </Pressable>
        ) : (
          <Text
            className="text-[11px] font-semibold"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            Tap a day to filter
          </Text>
        )}
      </View>
      <View className="flex-row mt-3">
        {week.map((day, i) => {
          const isSelected = selectedDay ? sameDay(day, selectedDay) : false;
          const isToday = sameDay(day, today);
          const hasVisit = visitDayKeys.has(dayKey(day));
          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => onSelect(isSelected ? null : day)}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`}
              accessibilityState={isSelected ? { selected: true } : {}}
              className="flex-1 items-center active:opacity-70"
            >
              <Text
                className="text-[11px] font-bold"
                style={{ color: "rgba(255,255,255,0.75)" }}
              >
                {WEEK_LETTERS[i]}
              </Text>
              <View
                className="h-9 w-9 items-center justify-center mt-1.5"
                style={{
                  borderRadius: 999,
                  backgroundColor: isSelected ? "#FFFFFF" : "transparent",
                  borderWidth: !isSelected && isToday ? 1.5 : 0,
                  borderColor: "#FFFFFF",
                }}
              >
                <Text
                  className="text-[14px] font-bold"
                  style={{
                    color: isSelected ? theme.colors.primaryDeep : "#FFFFFF",
                  }}
                >
                  {day.getDate()}
                </Text>
              </View>
              <View
                className="h-1 w-1 mt-1"
                style={{
                  borderRadius: 999,
                  backgroundColor: hasVisit
                    ? isSelected
                      ? theme.colors.primary
                      : "#FFFFFF"
                    : "transparent",
                }}
              />
            </Pressable>
          );
        })}
      </View>
    </LinearGradient>
  );
}
