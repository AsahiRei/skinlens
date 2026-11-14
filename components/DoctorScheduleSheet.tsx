import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { Text } from "@/components/Text";
import { AppointmentSlotPicker } from "@/components/AppointmentSlotPicker";
import { PrimaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import {
  PAST_TIME_MESSAGE,
  SLOT_TAKEN_MESSAGE,
  overlapsTakenSlot,
  type AppointmentRow,
} from "@/lib/db/appointments";
import { formatSlotDay, formatSlotTime } from "@/utils/booking-slots";

/** Doctors can book further out than the patient's two-week request window. */
const DOCTOR_WINDOW_DAYS = 28;

function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}

export function fmtSlot(d: Date): string {
  return `${formatSlotDay(d)} · ${formatSlotTime(d)}`;
}

/**
 * Times the doctor can't use for this appointment, from the clinic queue they already have:
 * their confirmed visits (and unassigned confirmed ones, which the server counts against everyone),
 * plus the patient's other confirmed visits. Mirrors appointment_doctor_busy (0015).
 */
function bookedFor(a: AppointmentRow, rows: AppointmentRow[], doctorId: string | null): Date[] {
  const out: Date[] = [];
  for (const r of rows) {
    if (r.id === a.id || r.status !== "scheduled") continue;
    const mine = r.doctor_id === null || r.doctor_id === doctorId;
    if (!mine && r.patient_id !== a.patient_id) continue;
    const t = toDate(r.scheduled_at);
    if (t) out.push(t);
  }
  return out;
}

/** Other patients' pending requests for this doctor (or "first available") — pickable, flagged. */
function heldFor(a: AppointmentRow, rows: AppointmentRow[], doctorId: string | null): Date[] {
  const out: Date[] = [];
  for (const r of rows) {
    if (r.id === a.id || r.status !== "requested") continue;
    if (r.doctor_id !== null && r.doctor_id !== doctorId) continue;
    const t = toDate(r.preferred_time);
    if (t) out.push(t);
  }
  return out;
}

/** Server messages meaning "this exact slot can't be used" — clear the pick so they choose again. */
function isDeadSlot(msg: string): boolean {
  return (
    msg === SLOT_TAKEN_MESSAGE ||
    msg === PAST_TIME_MESSAGE ||
    /within 30 minutes|already booked|already passed/i.test(msg)
  );
}

/**
 * Bottom sheet where a doctor books (or moves) a visit on the clinic's 30-minute grid.
 *
 * Render with a fresh `key` per open so the pick starts from the patient's requested time.
 */
export function DoctorScheduleSheet({
  visible,
  appointment: a,
  patientName,
  clinicHours,
  doctorId,
  clinicRows,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  appointment: AppointmentRow;
  patientName: string;
  clinicHours?: string | null;
  doctorId: string | null;
  /** Every appointment at the clinic — used to grey out booked times. */
  clinicRows: AppointmentRow[];
  onDismiss: () => void;
  /** Must reject with the server's message on failure. */
  onConfirm: (scheduledAt: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const isMove = a.status === "scheduled";
  // Sampled once per open (the sheet is re-keyed each time) — keeps render pure.
  const [openedAt] = useState(() => Date.now());

  const booked = useMemo(() => bookedFor(a, clinicRows, doctorId), [a, clinicRows, doctorId]);
  const held = useMemo(() => heldFor(a, clinicRows, doctorId), [a, clinicRows, doctorId]);

  const requested = toDate(a.preferred_time);
  const current = isMove ? toDate(a.scheduled_at) : null;
  const requestedUsable =
    requested !== null && requested.getTime() > openedAt && !overlapsTakenSlot(requested, booked);

  // New requests open on the patient's ask; a reschedule starts empty.
  const [picked, setPicked] = useState<Date | null>(() =>
    !isMove && requestedUsable ? requested : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickedIsRequested =
    picked !== null && requested !== null && picked.getTime() === requested.getTime();
  const pickedIsCurrent =
    picked !== null && current !== null && picked.getTime() === current.getTime();

  const canUseRequested = !isMove && requestedUsable && !pickedIsRequested;
  // One line of context under the title: what's booked now, or what the patient asked for.
  const contextLine = current
    ? `Currently ${fmtSlot(current)}`
    : requested
      ? `Asked for ${fmtSlot(requested)}${
          requested.getTime() <= openedAt
            ? " (passed)"
            : !requestedUsable
              ? " (you're booked then)"
              : ""
        }`
      : null;

  const close = () => {
    if (!saving) onDismiss();
  };

  const confirm = async () => {
    if (!picked || saving) return;
    if (picked.getTime() <= Date.now()) {
      setPicked(null);
      setError(PAST_TIME_MESSAGE);
      return;
    }
    if (pickedIsCurrent) {
      setError("That's the current visit time — pick a different slot to move it.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onConfirm(picked.toISOString());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (isDeadSlot(msg)) setPicked(null);
      setError(msg || "Couldn't save that time — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(16, 36, 26, 0.5)" }}>
        <Pressable className="flex-1" onPress={close} accessibilityLabel="Close scheduler" />
        <View
          style={{
            maxHeight: height * 0.92,
            backgroundColor: theme.colors.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
        >
          <View className="flex-row items-start gap-3 px-5 pt-5 pb-4">
            <View className="flex-1">
              <Text className="font-bold text-[19px]" style={{ color: theme.colors.ink }}>
                {isMove ? "Reschedule" : "Schedule"} {patientName}
              </Text>
              {contextLine ? (
                <Text className="text-[13px] mt-1" style={{ color: theme.colors.muted }}>
                  {contextLine}
                  {canUseRequested ? (
                    <Text
                      onPress={() => {
                        setPicked(requested);
                        setError(null);
                      }}
                      accessibilityRole="button"
                      className="font-bold"
                      style={{ color: theme.colors.primary }}
                    >
                      {"  Use this time"}
                    </Text>
                  ) : null}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={close}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
              style={{ backgroundColor: theme.colors.background }}
            >
              <X size={18} color={theme.colors.body} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: theme.colors.divider }} />

          <ScrollView
            className="px-5"
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <AppointmentSlotPicker
              viewer="doctor"
              clinicId={a.clinic_id}
              doctorId={doctorId}
              hoursText={clinicHours}
              windowDays={DOCTOR_WINDOW_DAYS}
              bookedTimes={booked}
              heldTimes={held}
              requestedAt={isMove ? current : requested}
              value={picked}
              onChange={(d) => {
                setPicked(d);
                setError(null);
              }}
            />
          </ScrollView>

          {/* Sticky footer: the choice + confirm */}
          <View
            className="px-5 pt-3 flex-col gap-2.5"
            style={{
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              borderTopWidth: 1,
              borderTopColor: theme.colors.divider,
            }}
          >
            {error ? (
              <Text className="text-[13px]" style={{ color: theme.colors.danger }}>
                {error}
              </Text>
            ) : picked && overlapsTakenSlot(picked, held) ? (
              <Text className="text-[13px]" style={{ color: theme.colors.warningText }}>
                {"Another patient asked for this time — they'll be asked to pick a new one."}
              </Text>
            ) : null}
            <PrimaryButton
              label={picked ? `${isMove ? "Move to" : "Book"} ${fmtSlot(picked)}` : "Pick a time"}
              onPress={() => void confirm()}
              disabled={!picked}
              loading={saving}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
