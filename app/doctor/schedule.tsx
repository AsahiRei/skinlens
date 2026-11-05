import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { CalendarCheck2, CircleAlert } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { DoctorAppointmentCard } from "@/components/DoctorAppointmentCard";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  ClinicalCard,
  EmptyState,
  Notice,
  Pill,
  ScreenHeader,
  SectionTitle,
} from "@/components/ui";
import { useDoctorQueue } from "@/hooks/useDoctorQueue";
import { theme } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import {
  patientAvatarFor,
  patientDisplayFor,
  type AppointmentRow,
  type AppointmentStatus,
} from "@/lib/db/appointments";

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isTomorrow(d: Date): boolean {
  const now = new Date();
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupLabel(r: AppointmentRow): string {
  const d = new Date(r.scheduled_at ?? "");
  if (Number.isNaN(d.getTime())) return "Unspecified";
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DoctorSchedule() {
  const {
    rows,
    patientNames,
    patientAvatars,
    loading,
    refreshing,
    error,
    refresh,
    applyStatus,
  } = useDoctorQueue();

  const [actingId, setActingId] = useState<string | null>(null);
  // Action failures (incl. "slot already booked") must be visible here,
  // not swallowed by console.error.
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (id: string, status: AppointmentStatus) => {
    setActingId(id);
    setActionError(null);
    try {
      await applyStatus(id, status);
      const label =
        status === "completed" ? "Visit marked complete"
        : status === "cancelled" ? "Visit cancelled"
        : status === "declined" ? "Request declined"
        : "Status updated";
      ToastAndroid.show(label, ToastAndroid.SHORT);
    } catch (err) {
      console.error("[doctor/schedule] action failed:", err);
      setActionError(
        err instanceof Error ? err.message : "Couldn't save that change — try again.",
      );
    } finally {
      setActingId(null);
    }
  };

  const scheduled = rows.filter((r) => r.status === "scheduled");

  // Group confirmed visits by date so the day's agenda is scannable.
  const grouped = useMemo(() => {
    const today: AppointmentRow[] = [];
    const tomorrow: AppointmentRow[] = [];
    const upcoming: AppointmentRow[] = [];
    const unspecified: AppointmentRow[] = [];
    for (const r of scheduled) {
      const d = new Date(r.scheduled_at ?? "");
      if (Number.isNaN(d.getTime())) {
        unspecified.push(r);
      } else if (isToday(d)) {
        today.push(r);
      } else if (isTomorrow(d)) {
        tomorrow.push(r);
      } else {
        upcoming.push(r);
      }
    }
    return { today, tomorrow, upcoming, unspecified };
  }, [scheduled]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Header */}
        <FadeItem index={0}>
          <View className="mt-2">
            <ScreenHeader title="Schedule" subtitle="Confirmed visits" />
          </View>
        </FadeItem>

        {actionError ? (
          <View className="mt-3">
            <Notice icon={CircleAlert} copy={actionError} />
          </View>
        ) : null}

        {loading ? (
          <View className="flex-col gap-3 mt-4">
            {[0, 1].map((i) => (
              <ClinicalCard key={i} className="flex-col gap-3">
                <View className="flex-row items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <View className="flex-1 gap-1.5">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="h-3 w-44 rounded-md" />
                  </View>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </View>
                <Skeleton className="h-11 w-full rounded-full" />
              </ClinicalCard>
            ))}
          </View>
        ) : error ? (
          <FadeItem index={2}>
            <ClinicalCard className="mt-4">
              <EmptyState icon={CircleAlert} title="Couldn't load" copy={error} />
            </ClinicalCard>
          </FadeItem>
        ) : (
          <>
            <FadeItem index={2}>
              <View className="mt-5">
                <SectionTitle
                  title="Confirmed visits"
                  meta={`${scheduled.length} total`}
                />
              </View>
            </FadeItem>
            {scheduled.length === 0 ? (
              <FadeItem index={3}>
                <ClinicalCard className="mt-3">
                  <EmptyState
                    icon={CalendarCheck2}
                    title="Nothing scheduled"
                    copy="Confirmed visits will appear here once you schedule requests from Home."
                  />
                </ClinicalCard>
              </FadeItem>
            ) : (
              <View className="flex-col gap-5 mt-3">
                {grouped.today.length > 0 && (
                  <View className="flex-col gap-3">
                    <View className="flex-row items-center gap-2">
                      <Pill label="Today" tone="primary" />
                      <Text className="text-xs" style={{ color: theme.colors.muted }}>
                        {grouped.today.length} visit{grouped.today.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    {grouped.today.map((a, idx) => (
                      <FadeItem key={a.id} index={Math.min(3 + idx, 8)}>
                        <DoctorAppointmentCard
                          appointment={a}
                          patientName={patientDisplayFor(a, patientNames)}
                          patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
                          busy={actingId === a.id}
                          compact
                          onAction={(id, status) => void handleAction(id, status)}
                        />
                      </FadeItem>
                    ))}
                  </View>
                )}
                {grouped.tomorrow.length > 0 && (
                  <View className="flex-col gap-3">
                    <View className="flex-row items-center gap-2">
                      <Pill label="Tomorrow" tone="warning" />
                      <Text className="text-xs" style={{ color: theme.colors.muted }}>
                        {grouped.tomorrow.length} visit{grouped.tomorrow.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    {grouped.tomorrow.map((a, idx) => (
                      <FadeItem key={a.id} index={Math.min(3 + idx, 8)}>
                        <DoctorAppointmentCard
                          appointment={a}
                          patientName={patientDisplayFor(a, patientNames)}
                          patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
                          busy={actingId === a.id}
                          compact
                          onAction={(id, status) => void handleAction(id, status)}
                        />
                      </FadeItem>
                    ))}
                  </View>
                )}
                {grouped.upcoming.length > 0 && (
                  <View className="flex-col gap-3">
                    <View className="flex-row items-center gap-2">
                      <Pill label="Upcoming" tone="neutral" />
                      <Text className="text-xs" style={{ color: theme.colors.muted }}>
                        {grouped.upcoming.length} visit{grouped.upcoming.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    {grouped.upcoming.map((a, idx) => (
                      <FadeItem key={a.id} index={Math.min(3 + idx, 8)}>
                        <DoctorAppointmentCard
                          appointment={a}
                          patientName={patientDisplayFor(a, patientNames)}
                          patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
                          busy={actingId === a.id}
                          compact
                          onAction={(id, status) => void handleAction(id, status)}
                        />
                      </FadeItem>
                    ))}
                  </View>
                )}
                {grouped.unspecified.length > 0 && (
                  <View className="flex-col gap-3">
                    <View className="flex-row items-center gap-2">
                      <Pill label="Unspecified" tone="neutral" />
                      <Text className="text-xs" style={{ color: theme.colors.muted }}>
                        {grouped.unspecified.length} visit{grouped.unspecified.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    {grouped.unspecified.map((a, idx) => (
                      <FadeItem key={a.id} index={Math.min(3 + idx, 8)}>
                        <DoctorAppointmentCard
                          appointment={a}
                          patientName={patientDisplayFor(a, patientNames)}
                          patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
                          busy={actingId === a.id}
                          compact
                          onAction={(id, status) => void handleAction(id, status)}
                        />
                      </FadeItem>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
