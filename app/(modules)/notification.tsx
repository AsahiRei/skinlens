import React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Building2,
  CalendarClock,
  Info,
  Stethoscope,
  Trash2,
  type LucideIcon,
} from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  BackHeader,
  ClinicalCard,
  EmptyState,
  PrimaryButton,
  UiModal,
} from "@/components/ui";
import { theme } from "@/lib/theme";
import Animated from "react-native-reanimated";
import { FadeItem } from "@/components/FadeItem";
import { fadeIn, PressableScale } from "@/components/motion";
import { useNotifications } from "@/hooks/useNotifications";
import {
  fullDateTime,
  getNotificationMeta,
  parseAppointmentReplyId,
  relativeTime,
} from "@/lib/notification-meta";
import {
  getMyAppointments,
  resolveAppointmentNames,
  type AppointmentRow,
} from "@/lib/db/appointments";

type AppointmentDetails = {
  row: AppointmentRow;
  clinicName: string;
  doctorName: string | null;
};

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  requested: { label: "Awaiting reply", color: "#92400E", bg: "#FEF3C7" },
  scheduled: { label: "Confirmed", color: "#1D4ED8", bg: "#EAF1FE" },
  completed: { label: "Completed", color: "#0F766E", bg: "#E6F6F4" },
  declined: { label: "Declined", color: "#DC2626", bg: "#FEF2F2" },
  cancelled: { label: "Cancelled", color: "#6B7280", bg: "#F3F4F6" },
};

/** Live appointment info for appointment-reply notifications. */
function useAppointmentDetails(notificationId: string | undefined) {
  const parsed = notificationId ? parseAppointmentReplyId(notificationId) : null;
  const appointmentId = parsed?.appointmentId;
  const [state, setState] = React.useState<{
    loading: boolean;
    details: AppointmentDetails | null;
  }>({ loading: !!appointmentId, details: null });

  React.useEffect(() => {
    if (!appointmentId) return;
    let alive = true;
    (async () => {
      try {
        const rows = await getMyAppointments();
        const row = rows.find((r) => r.id === appointmentId);
        if (!row) {
          if (alive) setState({ loading: false, details: null });
          return;
        }
        const names = await resolveAppointmentNames([row]);
        if (!alive) return;
        setState({
          loading: false,
          details: {
            row,
            clinicName: names.clinicNames[row.clinic_id] ?? "Clinic",
            doctorName: row.doctor_id ? (names.doctorNames[row.doctor_id] ?? null) : null,
          },
        });
      } catch {
        if (alive) setState({ loading: false, details: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [appointmentId]);

  return { isAppointment: !!appointmentId, ...state };
}

export default function NotificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { notifications, markAsRead, deleteNotification } = useNotifications();
  const [confirmVisible, setConfirmVisible] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const notification = React.useMemo(
    () => notifications.find((n) => n.id === id),
    [notifications, id],
  );
  const appt = useAppointmentDetails(notification?.id);

  React.useEffect(() => {
    if (notification && !notification.read) {
      markAsRead(notification.id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification?.id]);

  const handleConfirmDelete = async () => {
    if (!notification) return;
    setDeleting(true);
    try {
      await deleteNotification(notification.id);
      setConfirmVisible(false);
      router.back();
    } finally {
      setDeleting(false);
    }
  };

  if (!notification) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <View className="flex-1 px-5">
          <View className="mt-2">
            <BackHeader title="Notification" onBack={() => router.back()} />
          </View>
          <FadeItem index={1} className="mt-5">
            <ClinicalCard>
              <EmptyState
                title="Not found"
                copy="This notification was deleted or is no longer available."
              />
            </ClinicalCard>
          </FadeItem>
        </View>
      </SafeAreaView>
    );
  }

  const meta = getNotificationMeta(notification);
  const Icon = meta.icon;

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className="mt-2">
          <BackHeader
            title="Notification"
            onBack={() => router.back()}
            right={
              <PressableScale
                onPress={() => setConfirmVisible(true)}
                activeScale={0.9}
                accessibilityRole="button"
                accessibilityLabel="Delete notification"
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: "#FEF2F2" }}
              >
                <Trash2 size={16} color={theme.colors.danger} />
              </PressableScale>
            }
          />
        </View>

        {/* Hero */}
        <FadeItem index={1}>
        <ClinicalCard className="mt-5">
          <View className="flex-row items-center">
            <View
              className="h-12 w-12 rounded-2xl items-center justify-center"
              style={{ backgroundColor: meta.tint }}
            >
              <Icon size={22} color={meta.color} />
            </View>
            <View className="ml-3 flex-1">
              <View
                className="self-start rounded-full px-2.5 py-0.5"
                style={{ backgroundColor: meta.tint }}
              >
                <Text className="text-[12px] font-bold" style={{ color: meta.color }}>
                  {meta.label}
                </Text>
              </View>
              <Text className="text-[12px] mt-1" style={{ color: theme.colors.faint }}>
                {relativeTime(notification.created_at)} · {fullDateTime(notification.created_at)}
              </Text>
            </View>
          </View>

          <Text
            className="font-bold text-[20px] leading-7 mt-4"
            style={{ color: theme.colors.ink }}
          >
            {notification.title}
          </Text>
          <Text className="text-[15px] leading-6 mt-2" style={{ color: theme.colors.body }}>
            {notification.message}
          </Text>
        </ClinicalCard>
        </FadeItem>

        {/* Live appointment details */}
        {appt.isAppointment && (
          <FadeItem index={2}>
          <ClinicalCard className="mt-3">
            <Text
              className="text-[12px] font-bold uppercase mb-1"
              style={{ color: theme.colors.muted, letterSpacing: 0.8 }}
            >
              Appointment details
            </Text>
            {appt.loading ? (
              <View className="py-4 items-center">
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : appt.details ? (
              <Animated.View entering={fadeIn}>
                <AppointmentDetailRows details={appt.details} />
              </Animated.View>
            ) : (
              <Text className="text-[13px] mt-1" style={{ color: theme.colors.muted }}>
                Couldn&apos;t load this appointment. Check your connection or open
                Appointments to see its latest status.
              </Text>
            )}
          </ClinicalCard>
          </FadeItem>
        )}

        {/* What this means */}
        {meta.context ? (
          <FadeItem
            index={3}
            className="flex-row mt-3 px-4 py-3 rounded-2xl"
            style={{ backgroundColor: theme.colors.primarySoft }}
          >
            <Info size={16} color={theme.colors.primary} style={{ marginTop: 2 }} />
            <Text
              className="text-[13px] leading-5 ml-2 flex-1"
              style={{ color: theme.colors.primaryDeep }}
            >
              {meta.context}
            </Text>
          </FadeItem>
        ) : null}

        <FadeItem index={4} className="mt-6">
          <PrimaryButton label={meta.cta.label} onPress={() => router.push(meta.cta.href)} />
        </FadeItem>
      </ScrollView>

      <UiModal
        visible={confirmVisible}
        onDismiss={() => setConfirmVisible(false)}
        title="Delete this notification?"
        message="This cannot be undone."
        actions={[
          { label: "Cancel", onPress: () => setConfirmVisible(false), kind: "ghost" },
          {
            label: deleting ? "Deleting…" : "Delete",
            onPress: handleConfirmDelete,
            kind: "danger",
            loading: deleting,
            disabled: deleting,
          },
        ]}
      />
    </SafeAreaView>
  );
}

function AppointmentDetailRows({ details }: { details: AppointmentDetails }) {
  const { row, clinicName, doctorName } = details;
  const status = STATUS_LABEL[row.status] ?? STATUS_LABEL.requested;
  const when = row.scheduled_at
    ? fullDateTime(row.scheduled_at)
    : row.preferred_time
      ? `Preferred: ${fullDateTime(row.preferred_time)}`
      : "Not scheduled yet";
  return (
    <View>
      <DetailRow icon={Building2} label="Clinic" value={clinicName} />
      {doctorName ? <DetailRow icon={Stethoscope} label="Doctor" value={doctorName} /> : null}
      <DetailRow icon={CalendarClock} label="Date & time" value={when} />
      <View className="flex-row items-center justify-between pt-3 mt-1"
        style={{ borderTopWidth: 1, borderTopColor: theme.colors.divider }}
      >
        <Text className="text-[13px]" style={{ color: theme.colors.muted }}>
          Current status
        </Text>
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: status.bg }}>
          <Text className="text-[12px] font-bold" style={{ color: status.color }}>
            {status.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center py-2.5">
      <Icon size={16} color={theme.colors.muted} />
      <Text className="text-[13px] ml-2.5 w-24" style={{ color: theme.colors.muted }}>
        {label}
      </Text>
      <Text className="text-[14px] font-semibold flex-1 text-right" style={{ color: theme.colors.ink }}>
        {value}
      </Text>
    </View>
  );
}
