import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarClock } from "lucide-react-native";

import { theme } from "@/lib/theme";

function fmtSlot(value: Date): string {
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Date+time field that works on both platforms.
 *
 * WHY THIS EXISTS: @react-native-community/datetimepicker v9 crashes on
 * Android when the <DateTimePicker mode="datetime"> component is rendered
 * (`pickers[mode].dismiss()` — the native map only has `date`/`time` keys,
 * so `mode="datetime"` resolves to undefined). Only `mode="date"` and
 * `mode="time"` are safe as components on Android, so this field chains
 * them: date dialog first, then time dialog, combined into one Date.
 * iOS keeps a single inline `mode="datetime"` spinner.
 */
export function DateTimeField({
  value,
  onChange,
  placeholder,
  minimumDate,
  fallbackDate,
  onClear,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  placeholder: string;
  minimumDate?: Date;
  fallbackDate: Date;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"date" | "time">("date");
  const [pendingDate, setPendingDate] = useState<Date | null>(null);

  const openPicker = () => {
    setPendingDate(null);
    setStage("date");
    setOpen(true);
  };

  return (
    <View className="flex-col gap-2">
      <View
        className="flex-row items-center gap-2 rounded-2xl py-3.5 px-4 border"
        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.cardBorder }}
      >
        <Pressable
          onPress={openPicker}
          className="flex-row items-center gap-3 flex-1 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={placeholder}
        >
          <CalendarClock size={18} color={theme.colors.primary} />
          <Text
            className="flex-1 font-semibold text-[14px]"
            style={{
              color: value ? theme.colors.ink : theme.colors.faint,
            }}
          >
            {value ? fmtSlot(value) : placeholder}
          </Text>
        </Pressable>
        {value && onClear ? (
          <Pressable
            hitSlop={8}
            onPress={onClear}
            accessibilityLabel="Clear selected time"
          >
            <Text
              className="text-xs font-bold"
              style={{ color: theme.colors.primary }}
            >
              Clear
            </Text>
          </Pressable>
        ) : null}
      </View>

      {Platform.OS === "ios" ? (
        open ? (
          <DateTimePicker
            value={value ?? fallbackDate}
            mode="datetime"
            display="spinner"
            minimumDate={minimumDate}
            onChange={(_event, selected) => {
              if (selected) onChange(selected);
            }}
          />
        ) : null
      ) : (
        <>
          {open && stage === "date" ? (
            <DateTimePicker
              value={value ?? fallbackDate}
              mode="date"
              display="default"
              minimumDate={minimumDate}
              onChange={(event, selected) => {
                // Android dialog: dismiss leaves the answer untouched.
                if (event?.type === "dismissed" || !selected) {
                  setOpen(false);
                  return;
                }
                // Date chosen — chain into the time dialog.
                setPendingDate(selected);
                setStage("time");
              }}
            />
          ) : null}
          {open && stage === "time" ? (
            <DateTimePicker
              value={pendingDate ?? value ?? fallbackDate}
              mode="time"
              display="default"
              onChange={(event, selected) => {
                setOpen(false);
                if (event?.type === "dismissed" || !selected || !pendingDate)
                  return;
                const combined = new Date(pendingDate);
                combined.setHours(
                  selected.getHours(),
                  selected.getMinutes(),
                  0,
                  0,
                );
                onChange(combined);
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
