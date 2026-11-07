import { useState } from "react";
import { Image, Pressable, View } from "react-native";
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
import { DoctorProfileValidation } from "@/components/DoctorProfileValidation";
import { DoctorResultValidation } from "@/components/DoctorResultValidation";
import { ClinicalCard, Pill, PrimaryButton, UiModal } from "@/components/ui";
import { theme } from "@/lib/theme";
import {
  isRemoteImageUrl,
  type AppointmentRow,
  type AppointmentStatus,
} from "@/lib/db/appointments";
import { ReportViewerModal } from "@/components/ReportViewerModal";

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

const STATUS_LABELS: Record<string, string> = {
  requested: "New request",
  scheduled: "Scheduled",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** Requests older than this read "Waiting Nd" so stale ones stand out. */
const STALE_REQUEST_MS = 48 * 60 * 60 * 1000;

function statusLabelFor(status: string, createdAt: string | null): string {
  if (status === "requested" && createdAt) {
    const age = Date.now() - Date.parse(createdAt);
    if (Number.isFinite(age) && age >= STALE_REQUEST_MS) {
      return `Waiting ${Math.floor(age / (24 * 60 * 60 * 1000))}d`;
    }
  }
  return STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

/** "just now", "12m ago", "3h ago", "2d ago", then a short date. */
export function relativeAgo(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  /** Must reject on failure so the card keeps its scheduler open and stops
   * its spinner only once the write has actually finished. The parent is
   * responsible for showing the error message. */
  onAction: (id: string, status: AppointmentStatus, scheduledAt?: string) => Promise<void>;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Start from the patient's preferred slot when it's still ahead; otherwise
  // ~24h from now (computed per mount, not at module load, so it never goes stale).
  const [scheduledDate, setScheduledDate] = useState<Date>(() => {
    const preferred = a.preferred_time ? Date.parse(a.preferred_time) : NaN;
    if (Number.isFinite(preferred) && preferred > Date.now()) return new Date(preferred);
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  });
  const [acting, setActing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"decline" | "cancel" | "complete">("decline");
  const [reportOpen, setReportOpen] = useState(false);
  const showPhoto = isRemoteImageUrl(patientAvatarUrl);

  const avatarSize = compact ? 40 : 48;
  const rowBusy = busy || acting;

  const handleOpenReport = () => {
    if (a.report_pdf_path) setReportOpen(true);
  };

  const handleSchedule = async () => {
    if (rowBusy) return;
    setActing(true);
    try {
      await onAction(a.id, "scheduled", scheduledDate.toISOString());
      setExpanded(false);
    } catch {
      // Parent already surfaced the message (e.g. slot taken); keep the
      // scheduler open so the doctor can pick another time.
    } finally {
      setActing(false);
    }
  };

  const handleAction = async (status: AppointmentStatus) => {
    if (rowBusy) return;
    setActing(true);
    try {
      await onAction(a.id, status);
    } catch {
      // Parent already surfaced the message.
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
              Patient · Asked {relativeAgo(a.created_at)}
            </Text>
          </View>
          <Pill label={statusLabelFor(a.status, a.created_at)} tone={toneFor(a.status)} />
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
                onPress={handleOpenReport}
                accessibilityRole="button"
                accessibilityLabel="View skin report PDF"
                className="flex-row items-center gap-1.5 px-1 active:opacity-70"
              >
                <FileText size={13} color={theme.colors.primary} />
                <Text
                  className="text-[13px] font-semibold underline"
                  style={{ color: theme.colors.primary }}
                >
                  View skin report (PDF)
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
                onPress={handleOpenReport}
                accessibilityRole="button"
                accessibilityLabel="View skin report PDF"
                className="flex-row items-center gap-2 active:opacity-70"
              >
                <FileText size={14} color={theme.colors.primary} />
                <Text
                  className="text-[13px] font-semibold underline"
                  style={{ color: theme.colors.primary }}
                >
                  View skin report (PDF)
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* AI scan + profile review — open while the visit is still active */}
        {a.status === "requested" || a.status === "scheduled" ? (
          <>
            <DoctorResultValidation patientId={a.patient_id} />
            <DoctorProfileValidation patientId={a.patient_id} />
          </>
        ) : null}

        {/* Actions */}
        {a.status === "requested" ? (
          <View className="flex-col gap-2">
            {/* Primary action: filled while collapsed; once open it steps
                back to an outline so "Confirm schedule" is the one filled
                button on the card. */}
            <Pressable
              onPress={() => setExpanded(!expanded)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Hide scheduler" : "Schedule visit"}
              accessibilityState={{ expanded }}
              className="rounded-full overflow-hidden active:opacity-80"
              style={{
                borderRadius: theme.radius.pill,
                borderWidth: expanded ? 1.5 : 0,
                borderColor: theme.colors.primary,
                backgroundColor: theme.colors.card,
                opacity: rowBusy ? 0.6 : 1,
              }}
            >
              <LinearGradient
                colors={
                  expanded
                    ? [theme.colors.card, theme.colors.card]
                    : [...theme.gradients.dark]
                }
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                className="px-5 flex-row items-center justify-center gap-1.5"
                // +1.5 when borderless so toggling doesn't shift the layout
                style={{ paddingVertical: expanded ? 12 : 13.5 }}
              >
                <CalendarClock
                  size={16}
                  color={expanded ? theme.colors.primary : "#FFFFFF"}
                />
                <Text
                  className="font-bold text-[14px]"
                  style={{ color: expanded ? theme.colors.primary : "#FFFFFF" }}
                >
                  {expanded ? "Hide scheduler" : "Schedule visit"}
                </Text>
                <ChevronDown
                  size={15}
                  color={expanded ? theme.colors.primary : "#FFFFFF"}
                  style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
                />
              </LinearGradient>
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

      <ReportViewerModal
        reportPath={reportOpen ? a.report_pdf_path : null}
        onClose={() => setReportOpen(false)}
        title={`${patientName} · Skin Report`}
      />

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
            ? "This will decline the patient's visit request. They'll see the update in their Appointments screen."
            : confirmKind === "cancel"
              ? "This will cancel the scheduled visit. The patient will see it in their Appointments screen."
              : "This will mark the visit as completed. The patient's record will be closed."
        }
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
