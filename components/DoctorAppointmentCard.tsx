import { useState } from "react";
import { Image, Pressable, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { LinearGradient } from "expo-linear-gradient";
import {
  CalendarCheck2,
  CalendarClock,
  ChevronDown,
  Clock3,
  FileText,
} from "lucide-react-native";

import { DateTimeField } from "@/components/DateTimeField";
import { DoctorResultValidation } from "@/components/DoctorResultValidation";
import { ClinicalCard, Pill, PrimaryButton, UiModal } from "@/components/ui";
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
    year: "numeric",
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

/**
 * One appointment row for the doctor tabs.
 *
 * The card is now self-contained: it manages its own expanded/scheduling
 * state and its own scheduledDate, so scheduling one row never clobbers
 * another. Parents pass `onAction` for status changes and `compact` for
 * the condensed history rendering.
 *
 * `compact` shrinks the card chrome (padding, avatar, spacing) and
 * collapses the details box into one line — text sizes stay the same.
 * Used for the Home history list and the Schedule tab.
 */
export function DoctorAppointmentCard({
  appointment: a,
  patientName,
  patientAvatarUrl = null,
  busy = false,
  onAction,
  compact = false,
}: {
  appointment: AppointmentRow;
  patientName: string;
  /** Remote (http(s)) profile-photo URL — falls back to the initial. */
  patientAvatarUrl?: string | null;
  /** Parent-level busy flag (e.g. a different row is mid-action). */
  busy?: boolean;
  onAction: (id: string, status: AppointmentStatus, scheduledAt?: string) => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date>(SCHEDULER_FALLBACK);
  const [acting, setActing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"decline" | "cancel" | "complete">("decline");
  const [openingReport, setOpeningReport] = useState(false);
  const showPhoto = isRemoteImageUrl(patientAvatarUrl);

  const avatarSize = compact ? 40 : 48;
  const rowBusy = busy || acting;

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

  const handleSchedule = async () => {
    if (rowBusy) return;
    setActing(true);
    try {
      await onAction(a.id, "scheduled", scheduledDate.toISOString());
      setExpanded(false);
    } catch (err) {
      console.error("[doctor-card] schedule failed:", err);
    } finally {
      setActing(false);
    }
  };

  const handleAction = async (status: AppointmentStatus) => {
    if (rowBusy) return;
    setActing(true);
    try {
      await onAction(a.id, status);
    } finally {
      setActing(false);
    }
  };

  const requestConfirm = (kind: "decline" | "cancel" | "complete") => {
    setConfirmKind(kind);
    setConfirmOpen(true);
  };

  const confirmAction = async () => {
    setConfirmOpen(false);
    if (confirmKind === "complete") {
      handleAction("completed");
    } else {
      handleAction(confirmKind === "decline" ? "declined" : "cancelled");
    }
  };

  return (
    <>
      <ClinicalCard
        className={compact ? "flex-col gap-2" : "flex-col gap-3"}
        style={compact ? { paddingHorizontal: 12, paddingVertical: 12 } : undefined}
      >
        {/* Patient row */}
        <View
          className={
            compact ? "flex-row items-center gap-2.5" : "flex-row items-center gap-3"
          }
        >
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
            <Text
              className="font-bold text-[15px]"
              style={{ color: theme.colors.ink }}
              numberOfLines={1}
            >
              {patientName}
            </Text>
            <Text
              className="text-xs mt-0.5"
              style={{ color: theme.colors.muted }}
              numberOfLines={1}
            >
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
                  <>
                    Visit{" "}
                    <Text
                      className="font-bold"
                      style={{ color: theme.colors.primaryDeep }}
                    >
                      {fmtShort(a.scheduled_at)}
                    </Text>
                  </>
                ) : (
                  <>
                    Prefers{" "}
                    <Text
                      className="font-bold"
                      style={{ color: theme.colors.ink }}
                    >
                      {fmtShort(a.preferred_time)}
                    </Text>
                  </>
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
                Prefers{" "}
                <Text className="font-bold" style={{ color: theme.colors.ink }}>
                  {fmtShort(a.preferred_time)}
                </Text>
              </Text>
            </View>
            {a.scheduled_at ? (
              <View className="flex-row items-center gap-2">
                <CalendarCheck2 size={14} color={theme.colors.primary} />
                <Text className="text-[13px] flex-1" style={{ color: theme.colors.body }}>
                  Visit{" "}
                  <Text
                    className="font-bold"
                    style={{ color: theme.colors.primaryDeep }}
                  >
                    {fmtLong(a.scheduled_at)}
                  </Text>
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

        {/* AI scan review — open while the visit is still active */}
        {a.status === "requested" || a.status === "scheduled" ? (
          <DoctorResultValidation patientId={a.patient_id} />
        ) : null}

        {/* Actions */}
        {a.status === "requested" ? (
          <View className="flex-col gap-2">
            <Pressable
              onPress={() => setExpanded(!expanded)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Hide scheduler" : "Schedule visit"}
              className="rounded-full py-3 px-5 flex-row items-center justify-center gap-1.5 active:opacity-80 bg-white"
              style={{
                borderWidth: 1.5,
                borderColor: theme.colors.primary,
                opacity: rowBusy ? 0.6 : 1,
              }}
            >
              <CalendarClock size={16} color={theme.colors.primary} />
              <Text
                className="font-bold text-[14px]"
                style={{ color: theme.colors.primary }}
              >
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
                  onChange={setScheduledDate}
                  placeholder="Pick visit date & time"
                  minimumDate={new Date()}
                  fallbackDate={SCHEDULER_FALLBACK}
                />
                <PrimaryButton
                  label="Confirm schedule"
                  onPress={handleSchedule}
                  disabled={rowBusy}
                  loading={rowBusy}
                />
              </View>
            ) : null}

            <Pressable
              onPress={() => requestConfirm("decline")}
              disabled={rowBusy}
              accessibilityRole="button"
              accessibilityLabel="Decline request"
              className="items-center py-2 active:opacity-70"
            >
              <Text className="text-[13px] font-bold underline" style={{ color: theme.colors.danger }}>
                {rowBusy ? "Working…" : "Decline request"}
              </Text>
            </Pressable>
          </View>
        ) : a.status === "scheduled" ? (
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => requestConfirm("complete")}
              disabled={rowBusy}
              accessibilityRole="button"
              accessibilityLabel="Mark visit complete"
              className="flex-1 rounded-full py-3 items-center active:opacity-80"
              style={{
                backgroundColor: theme.colors.primary,
                opacity: rowBusy ? 0.7 : 1,
              }}
            >
              <Text className="font-bold text-white text-[14px]">
                {rowBusy ? "Saving…" : "Complete"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => requestConfirm("cancel")}
              disabled={rowBusy}
              accessibilityRole="button"
              accessibilityLabel="Cancel visit"
              className="flex-1 rounded-full py-3 items-center active:opacity-70 bg-white"
              style={{
                borderWidth: 1,
                borderColor: theme.colors.cardBorder,
                opacity: rowBusy ? 0.6 : 1,
              }}
            >
              <Text
                className="font-bold text-[14px]"
                style={{ color: theme.colors.danger }}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ClinicalCard>

      {/* Confirmation dialog for destructive actions */}
      <UiModal
        visible={confirmOpen}
        onDismiss={() => setConfirmOpen(false)}
        title={
          confirmKind === "decline"
            ? "Decline request?"
            : confirmKind === "cancel"
              ? "Cancel visit?"
              : "Mark complete?"
        }
        message={
          confirmKind === "decline"
            ? "This will decline the patient's visit request. They will be notified."
            : confirmKind === "cancel"
              ? "This will cancel the scheduled visit. The patient will be notified."
              : "This will mark the visit as completed. The patient's record will be closed."
        }
        icon={CalendarClock}
        tone={confirmKind === "complete" ? "soft" : "warning"}
        actions={[
          {
            label: confirmKind === "complete" ? "Mark Complete" : "Confirm",
            kind: confirmKind === "complete" ? "secondary" : "primary",
            loading: rowBusy,
            onPress: confirmAction,
          },
          {
            label: "Cancel",
            kind: "ghost",
            onPress: () => setConfirmOpen(false),
          },
        ]}
      />
    </>
  );
}

export { SCHEDULER_FALLBACK };
