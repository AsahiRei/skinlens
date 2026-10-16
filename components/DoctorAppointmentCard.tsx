import { useState } from "react";
import { Image, Pressable, Text, ToastAndroid, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  CalendarCheck2,
  CalendarClock,
  ChevronDown,
  Clock3,
  FileText,
} from "lucide-react-native";

import { DateTimeField } from "@/components/DateTimeField";
import { ClinicalCard, Pill } from "@/components/ui";
import { theme } from "@/lib/theme";
import {
  isRemoteImageUrl,
  type AppointmentRow,
  type AppointmentStatus,
} from "@/lib/db/appointments";
import { openAppointmentReport } from "@/utils/report";

const SCHEDULER_FALLBACK = new Date(Date.now() + 24 * 60 * 60 * 1000);

export function fmtShort(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtLong(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function toneFor(status: string): "primary" | "neutral" | "warning" {
  if (status === "requested") return "warning";
  if (status === "scheduled") return "primary";
  return "neutral";
}

function initialOf(name: string): string {
  const clean = name.trim().replace(/^@/, "");
  return (clean.charAt(0) || "?").toUpperCase();
}

export { SCHEDULER_FALLBACK };

/**
 * One appointment row for the doctor tabs. Requested rows get the
 * schedule/decline actions, scheduled rows get complete/cancel, and
 * closed rows render a read-only footer.
 *
 * `compact` shrinks the card chrome (padding, avatar, spacing) and
 * collapses the details box into one line — text sizes stay the same.
 * Used for the Home history list.
 */
export function DoctorAppointmentCard({
  appointment: a,
  patientName,
  patientAvatarUrl = null,
  expanded,
  busy,
  scheduledDate,
  onToggleSchedule,
  onScheduledDateChange,
  onAction,
  compact = false,
}: {
  appointment: AppointmentRow;
  patientName: string;
  /** Remote (http(s)) profile-photo URL — falls back to the initial. */
  patientAvatarUrl?: string | null;
  expanded: boolean;
  busy: boolean;
  scheduledDate: Date;
  onToggleSchedule: () => void;
  onScheduledDateChange: (d: Date) => void;
  onAction: (id: string, status: AppointmentStatus, scheduledAt?: string) => void;
  compact?: boolean;
}) {
  const avatarSize = compact ? 40 : 48;
  const [openingReport, setOpeningReport] = useState(false);
  const showPhoto = isRemoteImageUrl(patientAvatarUrl);

  const handleOpenReport = async () => {
    if (!a.report_pdf_path || openingReport) return;
    setOpeningReport(true);
    try {
      await openAppointmentReport(a.report_pdf_path);
    } catch (err) {
      console.warn("[doctor-card] open report failed:", err);
      ToastAndroid.show(
        err instanceof Error ? err.message : "Couldn't open the report PDF.",
        ToastAndroid.LONG,
      );
    } finally {
      setOpeningReport(false);
    }
  };

  return (
    <ClinicalCard
      className={compact ? "flex-col gap-2" : "flex-col gap-3"}
      style={compact ? { paddingHorizontal: 12, paddingVertical: 12 } : undefined}
    >
      {/* Patient row */}
      <View className={compact ? "flex-row items-center gap-2.5" : "flex-row items-center gap-3"}>
        {showPhoto ? (
          <Image
            source={{ uri: (patientAvatarUrl as string).trim() }}
            style={{
              height: avatarSize,
              width: avatarSize,
              borderRadius: 999,
              backgroundColor: theme.colors.primarySoft,
            }}
            accessibilityLabel={`${patientName} profile photo`}
          />
        ) : (
          <LinearGradient
            colors={[...theme.gradients.icon]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              height: avatarSize,
              width: avatarSize,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text className="text-lg font-bold text-white">
              {initialOf(patientName)}
            </Text>
          </LinearGradient>
        )}
        <View className="flex-1">
          <Text className="font-bold text-[15px]" style={{ color: theme.colors.ink }} numberOfLines={1}>
            {patientName}
          </Text>
          <Text className="text-xs mt-0.5" style={{ color: theme.colors.muted }} numberOfLines={1}>
            Patient · Asked {fmtShort(a.created_at)}
          </Text>
        </View>
        <Pill label={a.status} tone={toneFor(a.status)} />
      </View>

      {/* Details */}
      {compact ? (
        <View className="flex-col gap-1.5">
        <View
          className="flex-row items-center gap-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: theme.colors.background }}
        >
          {a.scheduled_at ? (
            <CalendarCheck2 size={13} color={theme.colors.primary} />
          ) : (
            <Clock3 size={13} color={theme.colors.muted} />
          )}
          <Text
            className="text-[13px] flex-1"
            style={{ color: theme.colors.body }}
            numberOfLines={1}
          >
            {a.scheduled_at ? (
              <>Visit <Text className="font-bold" style={{ color: theme.colors.primaryDeep }}>{fmtShort(a.scheduled_at)}</Text></>
            ) : (
              <>Prefers <Text className="font-bold" style={{ color: theme.colors.ink }}>{fmtShort(a.preferred_time)}</Text></>
            )}
            {a.report_pdf_path ? " · Report" : ""}
          </Text>
        </View>
        {a.report_pdf_path ? (
          <Pressable
            onPress={() => void handleOpenReport()}
            disabled={openingReport}
            accessibilityRole="button"
            accessibilityLabel="Open skin report PDF"
            className="flex-row items-center gap-1.5 px-1 active:opacity-70"
          >
            <FileText size={13} color={theme.colors.primary} />
            <Text
              className="text-[13px] font-semibold underline"
              style={{ color: theme.colors.primary }}
            >
              {openingReport ? "Opening report…" : "Open skin report (PDF)"}
            </Text>
          </Pressable>
        ) : null}
        </View>
      ) : (
      <View
        className="flex-col gap-2 rounded-2xl px-3.5 py-3"
        style={{ backgroundColor: theme.colors.background }}
      >
        <View className="flex-row items-center gap-2">
          <Clock3 size={14} color={theme.colors.muted} />
          <Text className="text-[13px] flex-1" style={{ color: theme.colors.body }}>
            Prefers <Text className="font-bold" style={{ color: theme.colors.ink }}>{fmtShort(a.preferred_time)}</Text>
          </Text>
        </View>
        {a.scheduled_at ? (
          <View className="flex-row items-center gap-2">
            <CalendarCheck2 size={14} color={theme.colors.primary} />
            <Text className="text-[13px] flex-1" style={{ color: theme.colors.body }}>
              Visit <Text className="font-bold" style={{ color: theme.colors.primaryDeep }}>{fmtLong(a.scheduled_at)}</Text>
              {isToday(a.scheduled_at) ? " · today" : ""}
            </Text>
          </View>
        ) : null}
        {a.report_pdf_path ? (
          <Pressable
            onPress={() => void handleOpenReport()}
            disabled={openingReport}
            accessibilityRole="button"
            accessibilityLabel="Open skin report PDF"
            className="flex-row items-center gap-2 active:opacity-70"
          >
            <FileText size={14} color={theme.colors.primary} />
            <Text
              className="text-[13px] font-semibold underline"
              style={{ color: theme.colors.primary }}
            >
              {openingReport ? "Opening report…" : "Open skin report (PDF)"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      )}

      {/* Actions */}
      {a.status === "requested" ? (
        <View className="flex-col gap-2">
          <Pressable
            onPress={onToggleSchedule}
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Hide scheduler" : "Schedule visit"}
            className="rounded-full py-3 px-5 flex-row items-center justify-center gap-1.5 active:opacity-80 bg-white"
            style={{ borderWidth: 1.5, borderColor: theme.colors.primary }}
          >
            <CalendarClock size={16} color={theme.colors.primary} />
            <Text className="font-bold text-[14px]" style={{ color: theme.colors.primary }}>
              {expanded ? "Hide scheduler" : "Schedule visit"}
            </Text>
            <ChevronDown
              size={15}
              color={theme.colors.primary}
              style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
            />
          </Pressable>

          {expanded ? (
            <View className="flex-col gap-2 rounded-2xl p-3" style={{ backgroundColor: theme.colors.background }}>
              <DateTimeField
                value={scheduledDate}
                onChange={onScheduledDateChange}
                placeholder="Pick visit date & time"
                minimumDate={new Date()}
                fallbackDate={SCHEDULER_FALLBACK}
              />
              <Pressable
                onPress={() => onAction(a.id, "scheduled", scheduledDate.toISOString())}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Confirm schedule"
                className="rounded-full active:opacity-80"
                style={{ borderRadius: theme.radius.pill, overflow: "hidden", opacity: busy ? 0.7 : 1 }}
              >
                <LinearGradient
                  colors={[...theme.gradients.dark]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  className="py-3.5 px-5 items-center justify-center"
                >
                  <Text className="font-bold text-white text-[14px]">
                    {busy ? "Confirming…" : "Confirm schedule"}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={() => onAction(a.id, "declined")}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Decline request"
            className="items-center py-2 active:opacity-70"
          >
            <Text className="text-[13px] font-bold underline" style={{ color: theme.colors.danger }}>
              {busy ? "Working…" : "Decline request"}
            </Text>
          </Pressable>
        </View>
      ) : a.status === "scheduled" ? (
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => onAction(a.id, "completed")}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Mark visit complete"
            className="flex-1 rounded-full py-3 items-center active:opacity-80"
            style={{ backgroundColor: theme.colors.primary, opacity: busy ? 0.7 : 1 }}
          >
            <Text className="font-bold text-white text-[14px]">
              {busy ? "Saving…" : "Complete"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onAction(a.id, "cancelled")}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Cancel visit"
            className="flex-1 rounded-full py-3 items-center active:opacity-70 bg-white"
            style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
          >
            <Text className="font-bold text-[14px]" style={{ color: theme.colors.danger }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ClinicalCard>
  );
}
