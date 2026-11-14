import { useCallback, useMemo, useRef } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Bell,
  CalendarCheck2,
  CalendarDays,
  ChevronRight,
  Clock3,
  Inbox,
  MapPin,
  TriangleAlert,
} from "lucide-react-native";

import { Text } from "@/components/Text";
import { FadeItem } from "@/components/FadeItem";
import { CoachTarget } from "@/components/TutorialCoach";
import { useCoachScroller } from "@/hooks/useCoachScroller";
import { sameDay, startOfWeekMonday } from "@/components/DoctorWeekCalendar";
import {
  PatientAvatar,
  PatientRow,
  SectionHeader,
  fmtCountdown,
  fmtTime,
} from "@/components/DoctorUi";
import { relativeAgo } from "@/components/DoctorAppointmentCard";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { ClinicalCard, EmptyState, SecondaryButton } from "@/components/ui";
import { parseIso, useDoctorBoard, useNow } from "@/hooks/useDoctorBoard";
import { useNotifications } from "@/hooks/useNotifications";
import { theme, cardShadow } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import {
  SLOT_MINUTES,
  isPendingStatus,
  patientAvatarFor,
  patientDisplayFor,
  type AppointmentRow,
} from "@/lib/db/appointments";
import { formatSlotDay } from "@/utils/booking-slots";

const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const PREVIEW_COUNT = 3;
const HERO_SKELETON = "rgba(255,255,255,0.2)";

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "Dr. Reyes" from "Maria Reyes" / "Dr. Maria Reyes". */
function doctorTitle(name: string): string {
  const clean = name.trim().replace(/^dr\.?\s+/i, "");
  const parts = clean.split(/\s+/);
  return `Dr. ${parts[parts.length - 1] || clean}`;
}

const at = (r: AppointmentRow) => parseIso(r.scheduled_at)?.getTime() ?? Infinity;

/** Today: who's next, what needs a decision, and the day's agenda. */
export default function DoctorToday() {
  const board = useDoctorBoard();
  const { doctor, rows, patientNames, patientAvatars, loading, refreshing, error, refresh } = board;
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, scrollIntoView } = useCoachScroller(scrollRef);
  const { unreadCount, refresh: refreshNotifications } = useNotifications();
  const now = useNow();
  const today = new Date(now);

  // Check for new patient bookings whenever Today is shown.
  useFocusEffect(
    useCallback(() => {
      void refreshNotifications();
    }, [refreshNotifications]),
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshNotifications()]);
  }, [refresh, refreshNotifications]);

  const scheduled = useMemo(
    () => rows.filter((r) => r.status === "scheduled").sort((a, b) => at(a) - at(b)),
    [rows],
  );
  // Oldest request first — triage order.
  const pending = useMemo(
    () =>
      rows
        .filter((r) => isPendingStatus(r.status))
        .sort(
          (a, b) =>
            (parseIso(a.created_at)?.getTime() ?? 0) - (parseIso(b.created_at)?.getTime() ?? 0),
        ),
    [rows],
  );

  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const weekStart = startOfWeekMonday(today).getTime();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

  const todays = scheduled.filter((r) => at(r) >= startToday && sameDay(new Date(at(r)), today));
  const overdue = scheduled.filter((r) => at(r) < startToday);
  const thisWeek = scheduled.filter((r) => at(r) >= weekStart && at(r) < weekEnd).length;
  // In session (inside its 30-minute slot), else the next one coming up.
  const current = scheduled.find((r) => at(r) <= now && now < at(r) + SLOT_MS) ?? null;
  const next = current ?? scheduled.find((r) => at(r) > now) ?? null;
  const todayDone = todays.filter((r) => at(r) + SLOT_MS <= now).length;
  const oldestWait = pending[0] ? relativeAgo(pending[0].created_at) : null;

  const goSchedule = () => router.navigate("/doctor/schedule");
  const goRequests = () => router.navigate("/doctor/requests");

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
            className="flex-row items-start justify-between mt-2"
          >
            <View className="flex-1 pr-3">
              <Text
                className="text-[11px] font-bold uppercase"
                style={{ color: theme.colors.muted, letterSpacing: 0.8 }}
              >
                {today.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              {loading && !doctor ? (
                <Skeleton className="h-7 w-48 mt-1.5 rounded-lg" />
              ) : (
                <Text
                  className="font-bold text-[23px] mt-1"
                  style={{ color: theme.colors.ink }}
                  numberOfLines={1}
                >
                  {greetingFor(today.getHours())}, {doctorTitle(doctor?.displayName ?? "Doctor")}
                </Text>
              )}
              {doctor ? (
                <View className="flex-row items-center gap-1 mt-1">
                  <MapPin size={12} color={theme.colors.faint} />
                  <Text
                    className="text-xs flex-1"
                    style={{ color: theme.colors.faint }}
                    numberOfLines={1}
                  >
                    {doctor.clinicName} · {doctor.specialty}
                  </Text>
                </View>
              ) : null}
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
              {unreadCount > 0 ? (
                <View
                  className="absolute top-1.5 right-1.5 h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: theme.colors.danger,
                    borderWidth: 1,
                    borderColor: theme.colors.card,
                  }}
                />
              ) : null}
            </Pressable>
          </CoachTarget>
        </FadeItem>

        {/* Next patient */}
        <FadeItem index={1}>
          <Pressable
            onPress={goSchedule}
            accessibilityRole="button"
            accessibilityLabel={
              next
                ? `${current ? "In session" : "Next patient"}: ${patientDisplayFor(next, patientNames)}. Open schedule.`
                : "Open schedule"
            }
            className="mt-5 active:opacity-90"
          >
            <LinearGradient
              colors={[...theme.gradients.dark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 24, padding: 18, ...cardShadow }}
            >
              {loading ? (
                <View className="flex-row items-center gap-3.5">
                  <View
                    className="h-14 w-14 rounded-full"
                    style={{ backgroundColor: HERO_SKELETON }}
                  />
                  <View className="flex-1 gap-2">
                    <View className="h-3 w-24 rounded" style={{ backgroundColor: HERO_SKELETON }} />
                    <View className="h-5 w-40 rounded" style={{ backgroundColor: HERO_SKELETON }} />
                    <View className="h-3 w-28 rounded" style={{ backgroundColor: HERO_SKELETON }} />
                  </View>
                </View>
              ) : next ? (
                <NextPatient
                  row={next}
                  live={next === current}
                  name={patientDisplayFor(next, patientNames)}
                  avatarUrl={patientAvatarFor(next, patientAvatars)}
                  now={now}
                />
              ) : (
                <View className="flex-row items-center gap-3.5">
                  <View
                    className="h-14 w-14 rounded-full items-center justify-center"
                    style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
                  >
                    <CalendarCheck2 size={24} color="#FFFFFF" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-[17px] text-white">No upcoming visits</Text>
                    <Text className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {pending.length > 0
                        ? "Book a patient from your requests to fill your calendar."
                        : "Your calendar is clear."}
                    </Text>
                  </View>
                </View>
              )}
              <View
                className="flex-row items-center mt-4 pt-3"
                style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.14)" }}
              >
                <Text className="text-xs flex-1" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {loading
                    ? " "
                    : todays.length === 0
                      ? "No visits today"
                      : `${todays.length} ${todays.length === 1 ? "visit" : "visits"} today${
                          todayDone > 0 ? ` · ${todayDone} to close` : ""
                        }`}
                </Text>
                <Text className="text-xs font-bold text-white">Open schedule</Text>
                <ChevronRight size={14} color="#FFFFFF" />
              </View>
            </LinearGradient>
          </Pressable>
        </FadeItem>

        {/* Numbers */}
        <FadeItem index={2}>
          <CoachTarget
            id="doctor.stats"
            scrollIntoView={scrollIntoView}
            className="flex-row gap-3 mt-4"
          >
            <StatTile
              icon={<CalendarCheck2 size={16} color={theme.colors.primary} />}
              value={loading ? "–" : String(todays.length)}
              label="Today"
              onPress={goSchedule}
            />
            <StatTile
              icon={<Inbox size={16} color={theme.colors.warningText} />}
              value={loading ? "–" : String(pending.length)}
              label="Requests"
              tone={!loading && pending.length > 0 ? "warning" : "neutral"}
              onPress={goRequests}
            />
            <StatTile
              icon={<CalendarDays size={16} color={theme.colors.primary} />}
              value={loading ? "–" : String(thisWeek)}
              label="This week"
              onPress={goSchedule}
            />
          </CoachTarget>
        </FadeItem>

        {error ? (
          <FadeItem index={3}>
            <ClinicalCard className="mt-5">
              <EmptyState title="Couldn't load your clinic" copy={error} />
              <SecondaryButton label="Try again" onPress={() => void handleRefresh()} />
            </ClinicalCard>
          </FadeItem>
        ) : (
          <>
            {/* Needs attention */}
            <FadeItem index={3}>
              <CoachTarget id="doctor.queue" scrollIntoView={scrollIntoView} className="mt-6 gap-3">
                <SectionHeader
                  title="Needs attention"
                  pill
                  count={loading ? undefined : pending.length + overdue.length}
                  actionLabel={pending.length > 0 ? "All requests" : undefined}
                  onAction={goRequests}
                />
                {loading ? (
                  <ClinicalCard className="gap-3">
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </ClinicalCard>
                ) : pending.length === 0 && overdue.length === 0 ? (
                  <ClinicalCard>
                    <EmptyState
                      title="All caught up"
                      copy="New visit requests will show up here."
                    />
                  </ClinicalCard>
                ) : (
                  <ClinicalCard style={{ paddingVertical: 6 }}>
                    {overdue.length > 0 ? (
                      <Pressable
                        onPress={goSchedule}
                        accessibilityRole="button"
                        className="flex-row items-center gap-3 rounded-2xl px-3 py-2.5 my-1.5 active:opacity-80"
                        style={{ backgroundColor: theme.colors.warningBg }}
                      >
                        <TriangleAlert size={16} color={theme.colors.warningText} />
                        <Text
                          className="text-[13px] font-semibold flex-1"
                          style={{ color: theme.colors.warningText }}
                        >
                          {overdue.length} past {overdue.length === 1 ? "visit" : "visits"} not
                          marked done
                        </Text>
                        <ChevronRight size={15} color={theme.colors.warningText} />
                      </Pressable>
                    ) : null}
                    {pending.slice(0, PREVIEW_COUNT).map((r, i) => {
                      const t = parseIso(r.preferred_time);
                      return (
                        <PatientRow
                          key={r.id}
                          name={patientDisplayFor(r, patientNames)}
                          avatarUrl={patientAvatarFor(r, patientAvatars)}
                          detail={
                            r.status === "needs_reschedule"
                              ? "Picking a new time"
                              : t
                                ? `Wants ${formatSlotDay(t)} · ${fmtTime(t)}`
                                : "Any time"
                          }
                          meta={relativeAgo(r.created_at)}
                          metaTone="warning"
                          chevron
                          divider={i > 0 || overdue.length > 0}
                          onPress={goRequests}
                        />
                      );
                    })}
                    {pending.length > PREVIEW_COUNT ? (
                      <Pressable
                        onPress={goRequests}
                        accessibilityRole="button"
                        className="items-center py-3 active:opacity-70"
                        style={{ borderTopWidth: 1, borderTopColor: theme.colors.divider }}
                      >
                        <Text className="text-xs font-bold" style={{ color: theme.colors.primary }}>
                          +{pending.length - PREVIEW_COUNT} more · oldest waiting since {oldestWait}
                        </Text>
                      </Pressable>
                    ) : null}
                  </ClinicalCard>
                )}
              </CoachTarget>
            </FadeItem>

            {/* Today's agenda */}
            <FadeItem index={4}>
              <View className="mt-6 gap-3">
                <SectionHeader
                  title="Today's agenda"
                  pill
                  count={loading ? undefined : todays.length}
                  actionLabel="Full schedule"
                  onAction={goSchedule}
                />
                {loading ? (
                  <ClinicalCard className="gap-3">
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </ClinicalCard>
                ) : todays.length === 0 ? (
                  <ClinicalCard>
                    <EmptyState
                      title="No visits today"
                      copy={
                        next
                          ? `Next: ${patientDisplayFor(next, patientNames)} · ${formatSlotDay(
                              new Date(at(next)),
                            )}, ${fmtTime(new Date(at(next)))}`
                          : "Visits you book will appear here."
                      }
                    />
                  </ClinicalCard>
                ) : (
                  <ClinicalCard style={{ paddingVertical: 8 }}>
                    {todays.map((r, i) => (
                      <AgendaRow
                        key={r.id}
                        row={r}
                        name={patientDisplayFor(r, patientNames)}
                        avatarUrl={patientAvatarFor(r, patientAvatars)}
                        now={now}
                        divider={i > 0}
                        onPress={goSchedule}
                      />
                    ))}
                  </ClinicalCard>
                )}
              </View>
            </FadeItem>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function NextPatient({
  row,
  live,
  name,
  avatarUrl,
  now,
}: {
  row: AppointmentRow;
  live: boolean;
  name: string;
  avatarUrl: string | null;
  now: number;
}) {
  const t = new Date(at(row));
  const isToday = sameDay(t, new Date(now));
  return (
    <View className="flex-row items-center gap-3.5">
      <PatientAvatar name={name} url={avatarUrl} size={56} ring="rgba(255,255,255,0.35)" />
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          {live ? (
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: "#4ADE80" }} />
          ) : null}
          <Text
            className="text-[11px] font-bold uppercase"
            style={{ color: "rgba(255,255,255,0.75)", letterSpacing: 0.8 }}
          >
            {live ? "In session" : "Next patient"}
          </Text>
        </View>
        <Text className="font-bold text-[19px] text-white mt-0.5" numberOfLines={1}>
          {name}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-1">
          <Clock3 size={13} color="rgba(255,255,255,0.85)" />
          <Text className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>
            {isToday ? "Today" : formatSlotDay(t)} · {fmtTime(t)}
          </Text>
        </View>
      </View>
      <View
        className="rounded-full px-3 py-1.5"
        style={{ backgroundColor: "rgba(255,255,255,0.16)" }}
      >
        <Text className="text-xs font-bold text-white">{live ? "Now" : fmtCountdown(t, now)}</Text>
      </View>
    </View>
  );
}

function StatTile({
  icon,
  value,
  label,
  tone = "neutral",
  onPress,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone?: "neutral" | "warning";
  onPress: () => void;
}) {
  const warn = tone === "warning";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      className="flex-1 active:opacity-80"
    >
      <ClinicalCard
        style={{
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: warn ? theme.colors.warningBg : theme.colors.card,
          borderColor: warn ? theme.colors.warningBorder : theme.colors.cardBorder,
        }}
      >
        <View
          className="h-8 w-8 rounded-full items-center justify-center"
          style={{ backgroundColor: warn ? theme.colors.warningSoft : theme.colors.primarySoft }}
        >
          {icon}
        </View>
        <Text
          className="text-[22px] font-bold mt-2"
          style={{ color: warn ? theme.colors.warningText : theme.colors.ink }}
        >
          {value}
        </Text>
        <Text className="text-[11px] font-semibold" style={{ color: theme.colors.muted }}>
          {label}
        </Text>
      </ClinicalCard>
    </Pressable>
  );
}

function AgendaRow({
  row,
  name,
  avatarUrl,
  now,
  divider,
  onPress,
}: {
  row: AppointmentRow;
  name: string;
  avatarUrl: string | null;
  now: number;
  divider: boolean;
  onPress: () => void;
}) {
  const t = new Date(at(row));
  const live = t.getTime() <= now && now < t.getTime() + SLOT_MS;
  const past = t.getTime() + SLOT_MS <= now;
  const timeColor = live ? theme.colors.primary : past ? theme.colors.faint : theme.colors.ink;
  const barColor = live
    ? theme.colors.primary
    : past
      ? theme.colors.cardBorder
      : theme.colors.primaryTint;
  const metaColor = live
    ? theme.colors.primary
    : past
      ? theme.colors.warningText
      : theme.colors.faint;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${fmtTime(t)}, ${name}${live ? ", in session" : past ? ", to mark done" : ""}`}
      className="flex-row items-center gap-3 py-2.5 active:opacity-70"
      style={divider ? { borderTopWidth: 1, borderTopColor: theme.colors.divider } : undefined}
    >
      <View style={{ width: 60 }}>
        <Text className="text-[13px] font-bold" style={{ color: timeColor }}>
          {fmtTime(t)}
        </Text>
        <Text className="text-[10px]" style={{ color: theme.colors.faint }}>
          {SLOT_MINUTES} min
        </Text>
      </View>
      <View
        style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: barColor }}
      />
      <PatientAvatar name={name} url={avatarUrl} size={34} />
      <Text
        className="text-[14px] font-semibold flex-1"
        style={{ color: past ? theme.colors.muted : theme.colors.ink }}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Text className="text-[11px] font-bold" style={{ color: metaColor }}>
        {live ? "Now" : past ? "To close" : fmtCountdown(t, now)}
      </Text>
    </Pressable>
  );
}
