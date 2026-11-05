import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { CalendarClock, CheckCheck, CircleAlert, Inbox } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { DoctorAppointmentCard } from "@/components/DoctorAppointmentCard";
import { DoctorWeekCalendar, dayKey, sameDay } from "@/components/DoctorWeekCalendar";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  ClinicalCard,
  EmptyState,
  Notice,
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

function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function startOfWeekMonday(base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export default function DoctorHome() {
  const {
    doctor,
    rows,
    patientNames,
    patientAvatars,
    loading,
    refreshing,
    error,
    counts,
    refresh,
    applyStatus,
  } = useDoctorQueue();

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Quick-filter chips (All / Today / This week) — independent of the
  // calendar day filter; tap a chip to scope the request queue.
  const [quickFilter, setQuickFilter] = useState<"all" | "today" | "week">("all");
  // Action failures (e.g. slot already booked) surface via the card's
  // confirmation dialog; keep a top-level banner for anything else.
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (id: string, status: AppointmentStatus, scheduledAt?: string) => {
    try {
      await applyStatus(id, status, scheduledAt);
      const label =
        status === "scheduled" ? "Visit scheduled"
        : status === "completed" ? "Visit marked complete"
        : status === "declined" ? "Request declined"
        : status === "cancelled" ? "Visit cancelled"
        : "Status updated";
      ToastAndroid.show(label, ToastAndroid.SHORT);
    } catch (err) {
      console.error("[doctor/home] action failed:", err);
      setActionError(
        err instanceof Error ? err.message : "Couldn't save that change — try again.",
      );
    }
  };

  const fresh = rows.filter((r) => r.status === "requested");
  const history = rows.filter(
    (r) => r.status === "completed" || r.status === "cancelled" || r.status === "declined",
  );

  // Days in this week with at least one confirmed visit (dot indicator).
  const visitDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      if (!r.scheduled_at) continue;
      const d = new Date(r.scheduled_at);
      if (!Number.isNaN(d.getTime())) keys.add(dayKey(d));
    }
    return keys;
  }, [rows]);

  const selectedLabel = selectedDay
    ? selectedDay.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  // Calendar day filter: match on visit / preferred date.
  const matchesDay = (iso: string | null) => {
    if (!selectedDay) return true;
    if (!iso) return false;
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && sameDay(d, selectedDay);
  };

  // Quick-filter scope: matches on the visit date, falling back to the
  // patient's preferred time when the visit hasn't been scheduled yet.
  const matchesQuickFilter = (r: AppointmentRow) => {
    const iso = r.scheduled_at ?? r.preferred_time;
    if (!iso) return quickFilter === "all";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return quickFilter === "all";
    if (quickFilter === "today") return isToday(d);
    if (quickFilter === "week") {
      const monday = startOfWeekMonday(new Date());
      return d >= monday && d.getTime() < monday.getTime() + 7 * 24 * 60 * 60 * 1000;
    }
    return true;
  };

  const visibleFresh = fresh.filter((r) => matchesDay(r.scheduled_at ?? r.preferred_time) && matchesQuickFilter(r));
  const visibleHistory = history.filter((r) => matchesDay(r.scheduled_at ?? r.preferred_time) && matchesQuickFilter(r));
  const shownHistory = showAllHistory ? visibleHistory : visibleHistory.slice(0, 3);

  const skeleton = (
    <View className="flex-col gap-3 mt-3">
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
  );

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
            <ScreenHeader
              title={doctor ? `${greetingFor()}, ${doctor.displayName}` : greetingFor()}
            />
          </View>
        </FadeItem>

        {actionError ? (
          <View className="mt-3">
            <Notice icon={CircleAlert} copy={actionError} />
          </View>
        ) : null}

        {/* Stat strip */}
        <FadeItem index={1}>
          <View className="flex-row gap-3 mt-4">
            <ClinicalCard
              className="flex-1 items-center"
              style={{ paddingHorizontal: 12, paddingVertical: 14 }}
            >
              <View className="h-9 w-9 rounded-xl items-center justify-center" style={{ backgroundColor: "#FEF3C7" }}>
                <Inbox size={18} color="#B45309" />
              </View>
              <Text className="text-xl font-bold mt-1.5" style={{ color: theme.colors.ink }}>
                {loading ? "–" : counts.fresh}
              </Text>
              <Text className="text-[11px] font-semibold" style={{ color: theme.colors.muted }}>
                New requests
              </Text>
            </ClinicalCard>
            <ClinicalCard
              className="flex-1 items-center"
              style={{ paddingHorizontal: 12, paddingVertical: 14 }}
            >
              <View className="h-9 w-9 rounded-xl items-center justify-center" style={{ backgroundColor: theme.colors.primarySoft }}>
                <CalendarClock size={18} color={theme.colors.primary} />
              </View>
              <Text className="text-xl font-bold mt-1.5" style={{ color: theme.colors.ink }}>
                {loading ? "–" : counts.scheduled}
              </Text>
              <Text className="text-[11px] font-semibold" style={{ color: theme.colors.muted }}>
                Scheduled
              </Text>
            </ClinicalCard>
            <ClinicalCard
              className="flex-1 items-center"
              style={{ paddingHorizontal: 12, paddingVertical: 14 }}
            >
              <View className="h-9 w-9 rounded-xl items-center justify-center" style={{ backgroundColor: theme.colors.primarySoft }}>
                <CheckCheck size={18} color={theme.colors.primary} />
              </View>
              <Text className="text-xl font-bold mt-1.5" style={{ color: theme.colors.ink }}>
                {loading ? "–" : counts.today}
              </Text>
              <Text className="text-[11px] font-semibold" style={{ color: theme.colors.muted }}>
                Today
              </Text>
            </ClinicalCard>
          </View>
        </FadeItem>

        {/* Week calendar */}
        <FadeItem index={2}>
          <DoctorWeekCalendar
            selectedDay={selectedDay}
            onSelect={setSelectedDay}
            visitDayKeys={visitDayKeys}
          />
        </FadeItem>

        {/* Quick-filter chips for the request queue */}
        <FadeItem index={2.5}>
          <View className="flex-row gap-2 mt-3">
            {(["all", "today", "week"] as const).map((f) => {
              const active = quickFilter === f;
              const label = f === "all" ? "All" : f === "today" ? "Today" : "This week";
              return (
                <Pressable
                  key={f}
                  onPress={() => setQuickFilter(f)}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${label}`}
                  accessibilityState={active ? { selected: true } : {}}
                  className="rounded-full px-3 py-1.5 active:opacity-70"
                  style={{
                    backgroundColor: active ? theme.colors.primarySoft : theme.colors.card,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.cardBorder,
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: active ? theme.colors.primaryDeep : theme.colors.muted }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </FadeItem>

        {loading ? (
          skeleton
        ) : error ? (
          <FadeItem index={3}>
            <ClinicalCard className="mt-4">
              <EmptyState icon={CircleAlert} title="Couldn't load" copy={error} />
            </ClinicalCard>
          </FadeItem>
        ) : (
          <>
            {/* New requests */}
            <FadeItem index={3}>
              <View className="mt-5">
                <SectionTitle
                  title="New requests"
                  meta={`${visibleFresh.length} ${quickFilter === "all" ? "waiting" : quickFilter === "today" ? "today" : "this week"}`}
                />
              </View>
            </FadeItem>
            {visibleFresh.length === 0 ? (
              <FadeItem index={4}>
                <ClinicalCard className="mt-3">
                  <EmptyState
                    icon={Inbox}
                    title={selectedDay ? `Nothing on ${selectedLabel}` : "Inbox zero"}
                    copy={
                      selectedDay
                        ? "No requests match this day. Tap it again to clear the date filter."
                        : quickFilter !== "all"
                          ? "No new requests match this filter. Tap 'All' to see everything."
                          : "New patient requests for your clinic will appear here."
                    }
                  />
                </ClinicalCard>
              </FadeItem>
            ) : (
              <View className="flex-col gap-3 mt-3">
                {visibleFresh.map((a, idx) => (
                  <FadeItem key={a.id} index={Math.min(4 + idx, 8)}>
                    <DoctorAppointmentCard
                      appointment={a}
                      patientName={patientDisplayFor(a, patientNames)}
                      patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
                      busy={false}
                      onAction={(id, status, at) => void handleAction(id, status, at)}
                    />
                  </FadeItem>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
