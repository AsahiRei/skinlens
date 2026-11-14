import { useEffect, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { LinearGradient } from "expo-linear-gradient";

import { DoctorProfileValidation } from "@/components/DoctorProfileValidation";
import { DoctorResultValidation } from "@/components/DoctorResultValidation";
import { DoctorScheduleSheet, fmtSlot } from "@/components/DoctorScheduleSheet";
import { PatientAvatar } from "@/components/DoctorUi";
import { ClinicalCard, Pill, UiModal } from "@/components/ui";
import { theme } from "@/lib/theme";
import {
  completionOpensAt,
  isPendingStatus,
  type AppointmentRow,
  type AppointmentStatus,
} from "@/lib/db/appointments";
import { ReportViewerModal } from "@/components/ReportViewerModal";

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

/** "Thu, Nov 20 · 10:30 AM" — adds the year only when it isn't this year. */
function fmtVisit(value: string | null): string {
  if (!value) return "Any time";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  if (d.getFullYear() !== new Date().getFullYear()) return fmtShort(value);
  return fmtSlot(d);
}

/** Only closed visits carry a status chip — open ones say what they are through their actions. */
const CLOSED_LABELS: Record<string, { label: string; tone: "primary" | "neutral" }> = {
  completed: { label: "Completed", tone: "primary" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Requests older than this get their age highlighted. */
const STALE_REQUEST_MS = 48 * 60 * 60 * 1000;

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

/**
 * Re-renders when `at` arrives (and whenever the app returns to the foreground, since JS timers pause
 * in the background). Returns whether `at` has passed.
 */
function useHasArrived(at: Date | null): boolean {
  const target = at?.getTime() ?? null;
  // Clock sampled only from timer / AppState callbacks, never during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) return;
    const sample = () => setNow(Date.now());
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sample();
    });
    // Fires immediately when `target` already passed. setTimeout overflows past ~24.8 days, so
    // far-off visits re-check daily (each sample re-runs this effect).
    const wait = Math.max(0, Math.min(target - Date.now() + 250, 24 * 60 * 60 * 1000));
    const timer = setTimeout(sample, wait);
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [target, now]);
  return target !== null && now >= target;
}

type ConfirmKind = "decline" | "cancel" | "complete";

const CONFIRM_COPY: Record<ConfirmKind, { title: string; message: string; label: string }> = {
  decline: {
    title: "Decline request?",
    message: "The patient will see the update in their Appointments screen.",
    label: "Decline request",
  },
  cancel: {
    title: "Cancel visit?",
    message: "The patient will see the update in their Appointments screen.",
    label: "Cancel visit",
  },
  complete: {
    title: "Mark visit as done?",
    message: "This closes the patient's appointment.",
    label: "Mark as done",
  },
};

/**
 * One appointment for the doctor tabs: who, when, the review panels and the actions its status
 * allows. Booking happens in DoctorScheduleSheet, on the clinic's slot grid.
 */
export function DoctorAppointmentCard({
  appointment: a,
  patientName,
  patientAvatarUrl = null,
  busy = false,
  assignedToOther = null,
  doctorId = null,
  clinicHours = null,
  clinicRows = [],
  onAction,
  compact = false,
  showTime = true,
}: {
  appointment: AppointmentRow;
  patientName: string;
  /** Remote (http(s)) profile-photo URL — falls back to the initial. */
  patientAvatarUrl?: string | null;
  /** Parent-level busy flag (e.g. a different row is mid-action). */
  busy?: boolean;
  /** Name of the colleague this request is addressed to — only they can schedule it. */
  assignedToOther?: string | null;
  /** The signed-in doctor — whose calendar the slot grid checks. */
  doctorId?: string | null;
  /** Clinic opening-hours text for the slot grid. */
  clinicHours?: string | null;
  /** Every appointment at the clinic — booked times are greyed out from these. */
  clinicRows?: AppointmentRow[];
  /** Must reject on failure (with the server's message) so the scheduler stays open. */
  onAction: (id: string, status: AppointmentStatus, scheduledAt?: string) => Promise<void>;
  compact?: boolean;
  /** Off when the surrounding list already shows the time (the schedule timeline). */
  showTime?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Bumped per open so the sheet starts fresh from the patient's requested time.
  const [sheetKey, setSheetKey] = useState(0);
  const [acting, setActing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>("decline");
  const [reportOpen, setReportOpen] = useState(false);

  const rowBusy = busy || acting;
  const pending = isPendingStatus(a.status);
  const isScheduled = a.status === "scheduled";
  const active = pending || isScheduled;
  const canAct = !assignedToOther;
  // Mark as done opens at the visit time (the server enforces the same rule).
  const visitStarted = useHasArrived(completionOpensAt(a));
  const preferredMs = a.preferred_time ? Date.parse(a.preferred_time) : NaN;
  const requestedPassed = useHasArrived(
    Number.isFinite(preferredMs) ? new Date(preferredMs) : null,
  );
  const createdMs = a.created_at ? Date.parse(a.created_at) : NaN;
  const staleAt = Number.isFinite(createdMs) ? new Date(createdMs + STALE_REQUEST_MS) : null;
  const stale = useHasArrived(staleAt) && pending;

  const openSheet = () => {
    if (rowBusy || !canAct) return;
    setSheetKey((k) => k + 1);
    setSheetOpen(true);
  };

  const handleSchedule = async (iso: string) => {
    setActing(true);
    try {
      await onAction(a.id, "scheduled", iso);
      setSheetOpen(false);
    } finally {
      setActing(false);
    }
  };

  const askConfirm = (kind: ConfirmKind) => {
    setConfirmKind(kind);
    setConfirmOpen(true);
  };

  const runConfirmed = async () => {
    const kind = confirmKind;
    setConfirmOpen(false);
    if (rowBusy) return;
    const status: AppointmentStatus =
      kind === "complete" ? "completed" : kind === "decline" ? "declined" : "cancelled";
    setActing(true);
    try {
      await onAction(a.id, status);
    } catch {
      // Parent already surfaced the message.
    } finally {
      setActing(false);
    }
  };

  // One line under the name: the time that matters for this status.
  const when = isScheduled
    ? showTime
      ? fmtVisit(a.scheduled_at)
      : null
    : pending
      ? a.status === "needs_reschedule"
        ? "Picking a new time"
        : `${fmtVisit(a.preferred_time)}${requestedPassed ? " · passed" : ""}`
      : fmtVisit(a.scheduled_at ?? a.preferred_time);
  const closed = CLOSED_LABELS[a.status];

  return (
    <>
      <ClinicalCard
        className="flex-col gap-3"
        style={compact ? { paddingHorizontal: 14, paddingVertical: 14 } : undefined}
      >
        {/* Who + when */}
        <View className="flex-row items-center gap-3">
          <PatientAvatar name={patientName} url={patientAvatarUrl} size={compact ? 40 : 46} />
          <View className="flex-1">
            <Text
              className="font-bold text-[15px]"
              style={{ color: theme.colors.ink }}
              numberOfLines={1}
            >
              {patientName}
            </Text>
            {when ? (
              <Text
                className="text-[13px] mt-0.5"
                style={{ color: theme.colors.muted }}
                numberOfLines={1}
              >
                {when}
              </Text>
            ) : null}
          </View>
          {pending ? (
            <Text
              className="text-xs"
              style={{ color: stale ? theme.colors.warningText : theme.colors.faint }}
            >
              {relativeAgo(a.created_at)}
            </Text>
          ) : closed ? (
            <Pill label={closed.label} tone={closed.tone} />
          ) : null}
        </View>

        {a.report_pdf_path ? (
          <Pressable
            onPress={() => setReportOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="View skin report PDF"
            hitSlop={6}
            className="self-start active:opacity-70"
          >
            <Text className="text-[13px] font-semibold" style={{ color: theme.colors.primary }}>
              View skin report
            </Text>
          </Pressable>
        ) : null}

        {/* Review panels — while the visit is still open */}
        {active ? (
          <View className="flex-col gap-2">
            <DoctorResultValidation patientId={a.patient_id} />
            <DoctorProfileValidation patientId={a.patient_id} />
          </View>
        ) : null}

        {/* Why the doctor can't (or shouldn't yet) act */}
        {active && assignedToOther ? (
          <Note copy={`Addressed to ${assignedToOther} — only they can book this visit.`} />
        ) : a.status === "needs_reschedule" ? (
          <Note copy="Their time was taken by another visit, so they were asked to pick a new one. You can still book them." />
        ) : null}

        {/* Actions — only the ones this status allows right now */}
        {canAct && pending ? (
          <View className="flex-row gap-2">
            <OutlineButton
              label="Decline"
              danger
              disabled={rowBusy}
              onPress={() => askConfirm("decline")}
              flex={1}
            />
            <FilledButton
              label={rowBusy ? "Working…" : "Schedule visit"}
              disabled={rowBusy}
              onPress={openSheet}
              flex={2}
            />
          </View>
        ) : canAct && isScheduled ? (
          visitStarted ? (
            <View className="flex-row gap-2">
              <OutlineButton
                label="Cancel"
                danger
                disabled={rowBusy}
                onPress={() => askConfirm("cancel")}
                flex={1}
              />
              <FilledButton
                label={rowBusy ? "Saving…" : "Mark as done"}
                disabled={rowBusy}
                onPress={() => askConfirm("complete")}
                flex={2}
              />
            </View>
          ) : (
            <View className="flex-row gap-2">
              <OutlineButton
                label="Cancel"
                danger
                disabled={rowBusy}
                onPress={() => askConfirm("cancel")}
                flex={1}
              />
              <OutlineButton
                label={rowBusy ? "Saving…" : "Reschedule"}
                disabled={rowBusy}
                onPress={openSheet}
                flex={1}
              />
            </View>
          )
        ) : null}
      </ClinicalCard>

      {active && canAct ? (
        <DoctorScheduleSheet
          key={sheetKey}
          visible={sheetOpen}
          appointment={a}
          patientName={patientName}
          clinicHours={clinicHours}
          doctorId={doctorId}
          clinicRows={clinicRows}
          onDismiss={() => setSheetOpen(false)}
          onConfirm={handleSchedule}
        />
      ) : null}

      <ReportViewerModal
        reportPath={reportOpen ? a.report_pdf_path : null}
        onClose={() => setReportOpen(false)}
        title={`${patientName} · Skin Report`}
      />

      <UiModal
        visible={confirmOpen}
        onDismiss={() => setConfirmOpen(false)}
        title={CONFIRM_COPY[confirmKind].title}
        message={CONFIRM_COPY[confirmKind].message}
        actions={[
          {
            label: CONFIRM_COPY[confirmKind].label,
            kind: confirmKind === "complete" ? "primary" : "danger",
            loading: rowBusy,
            onPress: () => void runConfirmed(),
          },
          { label: "Keep it", kind: "ghost", onPress: () => setConfirmOpen(false) },
        ]}
      />
    </>
  );
}

function Note({ copy }: { copy: string }) {
  return (
    <Text className="text-xs leading-5" style={{ color: theme.colors.muted }}>
      {copy}
    </Text>
  );
}

function FilledButton({
  label,
  disabled,
  onPress,
  flex,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  flex: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="rounded-full overflow-hidden active:opacity-80"
      style={{ flex, borderRadius: theme.radius.pill }}
    >
      <LinearGradient
        colors={disabled ? [...theme.gradients.disabled] : [...theme.gradients.dark]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        className="items-center justify-center px-4"
        style={{ paddingVertical: 12.5 }}
      >
        <Text
          className="font-bold text-[14px]"
          style={{ color: disabled ? theme.colors.muted : "#FFFFFF" }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

function OutlineButton({
  label,
  danger = false,
  disabled,
  onPress,
  flex,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
  flex: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="items-center justify-center rounded-full px-4 active:opacity-70"
      style={{
        flex,
        paddingVertical: 11,
        backgroundColor: theme.colors.card,
        borderWidth: 1.5,
        borderColor: theme.colors.cardBorder,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text
        className="font-bold text-[14px]"
        style={{ color: danger ? theme.colors.danger : theme.colors.primary }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
