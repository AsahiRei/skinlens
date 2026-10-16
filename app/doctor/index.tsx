import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { CalendarCheck2, CalendarClock, CheckCheck, CircleAlert, Inbox } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { DoctorAppointmentCard, SCHEDULER_FALLBACK } from "@/components/DoctorAppointmentCard";
import { DoctorWeekCalendar, dayKey, sameDay } from "@/components/DoctorWeekCalendar";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  ClinicalCard,
  EmptyState,
  ScreenHeader,
  SectionTitle,
} from "@/components/ui";
import { useDoctorQueue } from "@/hooks/useDoctorQueue";
import { theme, cardShadow } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import {
  patientAvatarFor,
  patientDisplayFor,
  type AppointmentStatus,
} from "@/lib/db/appointments";

function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
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

  // Scheduler state (one row at a time) + per-row busy flag.
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<Date>(SCHEDULER_FALLBACK);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const handleAction = async (id: string, status: AppointmentStatus, scheduledAt?: string) => {
    setActingId(id);
    try {
      await applyStatus(id, status, scheduledAt);
      setSchedulingId(null);
    } catch (err) {
      console.error("[doctor/home] action failed:", err);
    } finally {
      setActingId(null);
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

  const visibleFresh = fresh.filter((r) =>
    matchesDay(r.scheduled_at ?? r.preferred_time),
  );
  const visibleHistory = history.filter((r) =>
    matchesDay(r.scheduled_at ?? r.preferred_time),
  );
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
              title={
                doctor ? `${greetingFor()}, ${doctor.displayName}` : greetingFor()
              }
            />
          </View>
        </FadeItem>

        {/* Stat strip */}
        <FadeItem index={1}>
          <View className="flex-row gap-3 mt-4">
            <View
              className="flex-1 bg-white px-3 py-3.5 items-center"
              style={{ borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.cardBorder, ...cardShadow }}
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
            </View>
            <View
              className="flex-1 bg-white px-3 py-3.5 items-center"
              style={{ borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.cardBorder, ...cardShadow }}
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
            </View>
            <View
              className="flex-1 bg-white px-3 py-3.5 items-center"
              style={{ borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.cardBorder, ...cardShadow }}
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
            </View>
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
                <SectionTitle title="New requests" meta={`${visibleFresh.length} waiting`} />
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
                      expanded={schedulingId === a.id}
                      busy={actingId === a.id}
                      scheduledDate={scheduledDate}
                      onToggleSchedule={() =>
                        setSchedulingId(schedulingId === a.id ? null : a.id)
                      }
                      onScheduledDateChange={setScheduledDate}
                      onAction={(id, status, at) => void handleAction(id, status, at)}
                    />
                  </FadeItem>
                ))}
              </View>
            )}

            {/* History */}
            <FadeItem index={5}>
              <View className="mt-6">
                <SectionTitle title="History" meta={`${visibleHistory.length} past`} />
              </View>
            </FadeItem>
            {visibleHistory.length === 0 ? (
              <FadeItem index={6}>
                <ClinicalCard className="mt-3">
                  <EmptyState
                    icon={CalendarCheck2}
                    title={selectedDay ? `Nothing on ${selectedLabel}` : "No history yet"}
                    copy={
                      selectedDay
                        ? "No past visits match this day. Tap it again to clear the date filter."
                        : "Completed, cancelled, and declined visits will appear here."
                    }
                  />
                </ClinicalCard>
              </FadeItem>
            ) : (
              <>
                <View className="flex-col gap-3 mt-3">
                  {shownHistory.map((a, idx) => (
                    <FadeItem key={a.id} index={Math.min(6 + idx, 9)}>
                    <DoctorAppointmentCard
                      appointment={a}
                      patientName={patientDisplayFor(a, patientNames)}
                      patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
                      expanded={false}
                      busy={false}
                      scheduledDate={scheduledDate}
                      onToggleSchedule={() => {}}
                      onScheduledDateChange={() => {}}
                      onAction={() => {}}
                      compact
                    />
                    </FadeItem>
                  ))}
                </View>
                {visibleHistory.length > 3 ? (
                  <FadeItem index={7}>
                    <Pressable
                      onPress={() => setShowAllHistory(!showAllHistory)}
                      accessibilityRole="button"
                      accessibilityLabel={showAllHistory ? "Show less history" : "Show all history"}
                      className="items-center py-3 active:opacity-70"
                    >
                      <Text className="text-[13px] font-bold underline" style={{ color: theme.colors.primary }}>
                        {showAllHistory ? "Show less" : `Show all (${visibleHistory.length})`}
                      </Text>
                    </Pressable>
                  </FadeItem>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
