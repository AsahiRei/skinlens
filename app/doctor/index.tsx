import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { LinearGradient } from "expo-linear-gradient";
import { Bell, CalendarClock, Inbox, Sun, type LucideIcon } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { CoachTarget } from "@/components/TutorialCoach";
import { useCoachScroller } from "@/hooks/useCoachScroller";
import { DoctorAppointmentCard, fmtShort } from "@/components/DoctorAppointmentCard";
import { DoctorWeekCalendar, dayKey, sameDay } from "@/components/DoctorWeekCalendar";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  ClinicalCard,
  EmptyState,
  Pill,
  SecondaryButton,
  SectionTitle,
  UiModal,
} from "@/components/ui";
import { useDoctorQueue } from "@/hooks/useDoctorQueue";
import { useNotifications } from "@/hooks/useNotifications";
import { theme, cardShadow } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import {
  isPendingStatus,
  patientAvatarFor,
  patientDisplayFor,
  type AppointmentRow,
  type AppointmentStatus,
} from "@/lib/db/appointments";

type HomeTab = "requests" | "scheduled" | "today";

/** Amber that stays readable on the dark gradient (matches calendar dots). */
const ON_DARK_AMBER = "#FCD34D";

function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function timeOf(iso: string | null): number {
  return parseDate(iso)?.getTime() ?? Number.POSITIVE_INFINITY;
}

type VisitGroup = {
  key: "overdue" | "today" | "tomorrow" | "upcoming" | "unspecified";
  label: string;
  tone: "primary" | "neutral" | "warning";
  hint?: string;
  rows: AppointmentRow[];
};

/**
 * Agenda buckets for the Scheduled tile (moved over from the old Schedule tab). Past visits never
 * marked complete land in "Overdue" so they get closed out.
 */
function groupVisits(rows: AppointmentRow[], now = new Date()): VisitGroup[] {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(startToday);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const groups: VisitGroup[] = [
    {
      key: "overdue",
      label: "Overdue",
      tone: "warning",
      hint: "mark complete or cancel",
      rows: [],
    },
    { key: "today", label: "Today", tone: "primary", rows: [] },
    { key: "tomorrow", label: "Tomorrow", tone: "primary", rows: [] },
    { key: "upcoming", label: "Upcoming", tone: "neutral", rows: [] },
    { key: "unspecified", label: "No time set", tone: "neutral", rows: [] },
  ];
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g])) as Record<
    VisitGroup["key"],
    VisitGroup
  >;
  for (const r of rows) {
    const d = parseDate(r.scheduled_at);
    if (!d) byKey.unspecified.rows.push(r);
    else if (d < startToday) byKey.overdue.rows.push(r);
    else if (sameDay(d, startToday)) byKey.today.rows.push(r);
    else if (sameDay(d, tomorrow)) byKey.tomorrow.rows.push(r);
    else byKey.upcoming.rows.push(r);
  }
  return groups.filter((g) => g.rows.length > 0);
}

/**
 * Stat tile that doubles as a tab: the selected tile takes the dark gradient (same family as the
 * calendar and tab dock) and drives the list below.
 */
function StatTab({
  icon: Icon,
  iconBg,
  iconColor,
  selectedIconColor = "#FFFFFF",
  value,
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  selectedIconColor?: string;
  value: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const body = (
    <>
      <View
        className="h-9 w-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: selected ? "rgba(255,255,255,0.16)" : iconBg }}
      >
        <Icon size={18} color={selected ? selectedIconColor : iconColor} />
      </View>
      <Text
        className="text-xl font-bold mt-1.5"
        style={{ color: selected ? "#FFFFFF" : theme.colors.ink }}
      >
        {value}
      </Text>
      <Text
        className="text-[11px] font-semibold"
        style={{ color: selected ? "rgba(255,255,255,0.85)" : theme.colors.muted }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      className="flex-1 active:opacity-80"
    >
      {selected ? (
        <LinearGradient
          colors={[...theme.gradients.dark]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            borderRadius: theme.radius.card,
            // Same footprint as ClinicalCard (1px border + padding) so
            // switching tabs never shifts the layout.
            borderWidth: 1,
            borderColor: "transparent",
            paddingHorizontal: 12,
            paddingVertical: 14,
            alignItems: "center",
            ...cardShadow,
          }}
        >
          {body}
        </LinearGradient>
      ) : (
        <ClinicalCard
          className="items-center"
          style={{ paddingHorizontal: 12, paddingVertical: 14 }}
        >
          {body}
        </ClinicalCard>
      )}
    </Pressable>
  );
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
  const router = useRouter();
  // Tab screens keep their scroll offset between visits, so the tutorial
  // needs to scroll its target back into view.
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, scrollIntoView } = useCoachScroller(scrollRef);
  const { unreadCount, refresh: refreshNotifications } = useNotifications();

  // Check for new patient bookings whenever Home is shown.
  useFocusEffect(
    useCallback(() => {
      void refreshNotifications();
    }, [refreshNotifications]),
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshNotifications()]);
  }, [refresh, refreshNotifications]);

  // Active tile. null only until the first load settles the default:
  // Requests when anything is waiting, otherwise Today.
  const [pickedTab, setPickedTab] = useState<HomeTab | null>(null);
  // Calendar day filter — applies to whichever list is active.
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  // Action failures (e.g. slot already booked) surface via the card's
  // confirmation dialog; keep a top-level banner for anything else.
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (id: string, status: AppointmentStatus, scheduledAt?: string) => {
    setActionError(null);
    try {
      await applyStatus(id, status, scheduledAt);
      const label =
        status === "scheduled"
          ? "Visit scheduled"
          : status === "completed"
            ? "Visit marked complete"
            : status === "declined"
              ? "Request declined"
              : status === "cancelled"
                ? "Visit cancelled"
                : "Status updated";
      ToastAndroid.show(label, ToastAndroid.SHORT);
    } catch (err) {
      console.error("[doctor/home] action failed:", err);
      setActionError(err instanceof Error ? err.message : "Couldn't save that change — try again.");
      throw err; // let the card keep its scheduler open
    }
  };

  // Modal title for a failed action, matched to the server's message.
  const actionErrorTitle = !actionError
    ? ""
    : /within 30 minutes|already booked/i.test(actionError)
      ? "Time not available"
      : /already passed/i.test(actionError)
        ? "That time has passed"
        : /marked done from/i.test(actionError)
          ? "Too early to mark as done"
          : /already closed/i.test(actionError)
            ? "Appointment already closed"
            : "Couldn't save that change";

  const today = new Date();

  // Pending requests, oldest first — the queue reads as triage order.
  const fresh = useMemo(
    () =>
      rows
        .filter((r) => isPendingStatus(r.status))
        .sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at)),
    [rows],
  );

  // Confirmed visits, soonest first (any without a valid time sort last).
  const scheduled = useMemo(
    () =>
      rows
        .filter((r) => r.status === "scheduled")
        .sort((a, b) => timeOf(a.scheduled_at) - timeOf(b.scheduled_at)),
    [rows],
  );

  // Calendar dots: white = a scheduled visit, amber = a request prefers it.
  const visitDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of scheduled) {
      const d = parseDate(r.scheduled_at);
      if (d) keys.add(dayKey(d));
    }
    return keys;
  }, [scheduled]);

  const requestDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of fresh) {
      const d = parseDate(r.preferred_time);
      if (d) keys.add(dayKey(d));
    }
    return keys;
  }, [fresh]);

  // Pick the default tab once, after the first load — recomputing it live would yank the doctor
  // from Requests to Today the moment they clear the last request.
  if (!loading && pickedTab === null) {
    setPickedTab(fresh.length > 0 ? "requests" : "today");
  }

  const tab: HomeTab = pickedTab ?? "requests";

  const selectTab = (next: HomeTab) => {
    setPickedTab(next);
    // "Today" is a fixed day — a leftover calendar filter would contradict it.
    if (next === "today") setSelectedDay(null);
  };

  const selectDay = (day: Date | null) => {
    setSelectedDay(day);
    // Picking another day while on Today means "show me that day's visits".
    if (day && tab === "today" && !sameDay(day, today)) setPickedTab("scheduled");
  };

  const dayLabel = selectedDay
    ? selectedDay.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const onDay = (iso: string | null, day: Date) => {
    const d = parseDate(iso);
    return d ? sameDay(d, day) : false;
  };

  const nextVisit = scheduled.find((r) => timeOf(r.scheduled_at) > today.getTime());

  // The active list plus its header / empty copy.
  let list: AppointmentRow[];
  let title: string;
  let meta: string | undefined;
  let emptyTitle: string;
  let emptyCopy: string;

  if (tab === "requests") {
    list = selectedDay ? fresh.filter((r) => onDay(r.preferred_time, selectedDay)) : fresh;
    title = "New requests";
    meta = selectedDay
      ? `${list.length} prefer ${dayLabel}`
      : `${list.length} waiting · oldest first`;
    emptyTitle = selectedDay ? `Nothing on ${dayLabel}` : "Inbox zero";
    emptyCopy = selectedDay
      ? "No pending requests prefer this day. Tap it again to clear the filter."
      : "New patient requests for your clinic will appear here.";
  } else if (tab === "scheduled") {
    list = selectedDay ? scheduled.filter((r) => onDay(r.scheduled_at, selectedDay)) : scheduled;
    title = selectedDay ? `Visits · ${dayLabel}` : "Scheduled visits";
    meta = `${list.length} ${list.length === 1 ? "visit" : "visits"}`;
    emptyTitle = selectedDay ? `No visits on ${dayLabel}` : "No scheduled visits";
    emptyCopy = selectedDay
      ? "Pick another day, or tap it again to clear the filter."
      : "Visits you schedule from New requests will appear here.";
  } else {
    list = scheduled.filter((r) => onDay(r.scheduled_at, today));
    title = "Today's schedule";
    meta = `${list.length} ${list.length === 1 ? "visit" : "visits"}`;
    emptyTitle = "No visits today";
    emptyCopy = nextVisit
      ? `Next visit: ${patientDisplayFor(nextVisit, patientNames)} · ${fmtShort(nextVisit.scheduled_at)}`
      : "Visits you schedule from New requests will appear here.";
  }

  const statValue = (n: number) => (loading ? "–" : String(n));

  const renderCard = (a: AppointmentRow, idx: number) => (
    <FadeItem key={a.id} index={Math.min(4 + idx, 8)}>
      <DoctorAppointmentCard
        appointment={a}
        patientName={patientDisplayFor(a, patientNames)}
        patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
        onAction={handleAction}
        compact={tab !== "requests"}
      />
    </FadeItem>
  );

  const skeleton = (
    <View className="flex-col gap-3 mt-5">
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
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: theme.colors.background }}
    >
      <ScreenGradient />
      <ScrollView
        ref={scrollRef}
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        onScroll={onScroll}
        scrollEventThrottle={32}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Header */}
        <FadeItem index={0}>
          <CoachTarget
            id="doctor.header"
            scrollIntoView={scrollIntoView}
            className="flex-row items-center justify-between mt-2"
          >
            <View className="flex-col flex-1 pr-3">
              <Text className="font-semibold text-[13px]" style={{ color: theme.colors.muted }}>
                {greetingFor()}
              </Text>
              {loading && !doctor ? (
                <Skeleton className="h-7 w-40 mt-1 rounded-lg" />
              ) : (
                <Text
                  className="font-bold text-[24px] mt-0.5"
                  style={{ color: theme.colors.ink }}
                  numberOfLines={1}
                >
                  {doctor?.displayName ?? "Doctor"}
                </Text>
              )}
              <Text className="text-[12px] mt-0.5" style={{ color: theme.colors.faint }}>
                {today.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </View>
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
              style={{
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.cardBorder,
              }}
              onPress={() => router.push("/(modules)/notifications?scope=doctor")}
              accessibilityRole="button"
              accessibilityLabel={
                unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
              }
              hitSlop={8}
            >
              <Bell size={20} color={theme.colors.primary} />
              {unreadCount > 0 && (
                <View
                  className="absolute top-1.5 right-1.5 h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: theme.colors.danger,
                    borderWidth: 1,
                    borderColor: theme.colors.card,
                  }}
                />
              )}
            </Pressable>
          </CoachTarget>
        </FadeItem>

        {/* Stat tabs — the selected tile drives the list below */}
        <FadeItem index={1}>
          <CoachTarget
            id="doctor.stats"
            scrollIntoView={scrollIntoView}
            className="flex-row gap-3 mt-4"
            accessibilityRole="tablist"
          >
            <StatTab
              icon={Inbox}
              iconBg={theme.colors.warningSoft}
              iconColor={theme.colors.warningText}
              selectedIconColor={ON_DARK_AMBER}
              value={statValue(counts.fresh)}
              label="New requests"
              selected={tab === "requests"}
              accessibilityLabel={`New requests, ${counts.fresh}`}
              onPress={() => selectTab("requests")}
            />
            <StatTab
              icon={CalendarClock}
              iconBg={theme.colors.primarySoft}
              iconColor={theme.colors.primary}
              value={statValue(counts.scheduled)}
              label="Scheduled"
              selected={tab === "scheduled"}
              accessibilityLabel={`Scheduled visits, ${counts.scheduled}`}
              onPress={() => selectTab("scheduled")}
            />
            <StatTab
              icon={Sun}
              iconBg={theme.colors.primarySoft}
              iconColor={theme.colors.primary}
              value={statValue(counts.today)}
              label="Today's visits"
              selected={tab === "today"}
              accessibilityLabel={`Today's visits, ${counts.today}`}
              onPress={() => selectTab("today")}
            />
          </CoachTarget>
        </FadeItem>

        {/* Week calendar — filters whichever list is active */}
        <FadeItem index={2}>
          <CoachTarget id="doctor.calendar" scrollIntoView={scrollIntoView}>
            <DoctorWeekCalendar
              selectedDay={selectedDay}
              onSelect={selectDay}
              visitDayKeys={visitDayKeys}
              requestDayKeys={requestDayKeys}
            />
          </CoachTarget>
        </FadeItem>

        <CoachTarget id="doctor.queue" scrollIntoView={scrollIntoView}>
          {loading ? (
            skeleton
          ) : error ? (
            <FadeItem index={3}>
              <ClinicalCard className="mt-4">
                <EmptyState title="Couldn't load your queue" copy={error} />
                <SecondaryButton label="Try again" onPress={() => void handleRefresh()} />
              </ClinicalCard>
            </FadeItem>
          ) : (
            // Keyed by tab + day so the stagger replays when the list swaps.
            <View key={`${tab}-${selectedDay ? dayKey(selectedDay) : "all"}`}>
              <FadeItem index={3}>
                <View className="mt-5">
                  <SectionTitle title={title} meta={meta} />
                </View>
              </FadeItem>
              {list.length === 0 ? (
                <FadeItem index={4}>
                  <ClinicalCard className="mt-3">
                    <EmptyState title={emptyTitle} copy={emptyCopy} />
                  </ClinicalCard>
                </FadeItem>
              ) : tab === "scheduled" && !selectedDay ? (
                // Full agenda: Overdue / Today / Tomorrow / Upcoming.
                <View className="flex-col gap-5 mt-3">
                  {groupVisits(list).map((g) => (
                    <View key={g.key} className="flex-col gap-3">
                      <View className="flex-row items-center gap-2">
                        <Pill label={g.label} tone={g.tone} />
                        <Text className="text-xs" style={{ color: theme.colors.muted }}>
                          {g.rows.length} visit{g.rows.length === 1 ? "" : "s"}
                          {g.hint ? ` · ${g.hint}` : ""}
                        </Text>
                      </View>
                      {g.rows.map((a, idx) => renderCard(a, idx))}
                    </View>
                  ))}
                </View>
              ) : (
                <View className="flex-col gap-3 mt-3">
                  {list.map((a, idx) => renderCard(a, idx))}
                </View>
              )}
            </View>
          )}
        </CoachTarget>
      </ScrollView>

      {/* Failed action (e.g. slot already taken) — the card keeps its scheduler open behind it. */}
      <UiModal
        visible={actionError !== null}
        onDismiss={() => setActionError(null)}
        title={actionErrorTitle}
        message={actionError ?? ""}
        actions={[{ label: "OK", kind: "primary", onPress: () => setActionError(null) }]}
      />
    </SafeAreaView>
  );
}
