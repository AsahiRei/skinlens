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

type GroupKey = "overdue" | "today" | "tomorrow" | "upcoming" | "unspecified";

type ScheduleGroup = {
  key: GroupKey;
  label: string;
  tone: "primary" | "neutral" | "warning";
  hint?: string;
  rows: AppointmentRow[];
};

// Display order of the agenda groups.
const GROUPS: Omit<ScheduleGroup, "rows">[] = [
  { key: "overdue", label: "Overdue", tone: "warning", hint: "mark complete or cancel" },
  { key: "today", label: "Today", tone: "primary" },
  { key: "tomorrow", label: "Tomorrow", tone: "warning" },
  { key: "upcoming", label: "Upcoming", tone: "neutral" },
  { key: "unspecified", label: "Unspecified", tone: "neutral" },
];

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
      throw err; // let the card know the write failed
    } finally {
      setActingId(null);
    }
  };

  const scheduled = useMemo(
    () => rows.filter((r) => r.status === "scheduled"),
    [rows],
  );

  // Group confirmed visits into an agenda, each group in visit-time order.
  // Rows arrive ordered by booking date, so sorting here is required.
  // Past visits never marked complete go to "Overdue" (not "Upcoming").
  const groups = useMemo<ScheduleGroup[]>(() => {
    const buckets: Record<GroupKey, AppointmentRow[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      upcoming: [],
      unspecified: [],
    };
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    for (const r of scheduled) {
      const d = new Date(r.scheduled_at ?? "");
      if (Number.isNaN(d.getTime())) buckets.unspecified.push(r);
      else if (d < startOfToday) buckets.overdue.push(r);
      else if (isToday(d)) buckets.today.push(r);
      else if (isTomorrow(d)) buckets.tomorrow.push(r);
      else buckets.upcoming.push(r);
    }
    const byTime = (x: AppointmentRow, y: AppointmentRow) =>
      Date.parse(x.scheduled_at ?? "") - Date.parse(y.scheduled_at ?? "");
    return GROUPS.map((g) => ({ ...g, rows: buckets[g.key].sort(byTime) })).filter(
      (g) => g.rows.length > 0,
    );
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
                {groups.map((g) => (
                  <View key={g.key} className="flex-col gap-3">
                    <View className="flex-row items-center gap-2">
                      <Pill label={g.label} tone={g.tone} />
                      <Text className="text-xs" style={{ color: theme.colors.muted }}>
                        {g.rows.length} visit{g.rows.length === 1 ? "" : "s"}
                        {g.hint ? ` · ${g.hint}` : ""}
                      </Text>
                    </View>
                    {g.rows.map((a, idx) => (
                      <FadeItem key={a.id} index={Math.min(3 + idx, 8)}>
                        <DoctorAppointmentCard
                          appointment={a}
                          patientName={patientDisplayFor(a, patientNames)}
                          patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
                          busy={actingId === a.id}
                          compact
                          onAction={handleAction}
                        />
                      </FadeItem>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
