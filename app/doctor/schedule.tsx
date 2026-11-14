import { useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";

import { Text } from "@/components/Text";
import { FadeItem } from "@/components/FadeItem";
import { CoachTarget } from "@/components/TutorialCoach";
import { useCoachScroller } from "@/hooks/useCoachScroller";
import { DoctorAppointmentCard } from "@/components/DoctorAppointmentCard";
import { DoctorWeekCalendar, dayKey, sameDay } from "@/components/DoctorWeekCalendar";
import { CardListSkeleton, PatientRow, SectionHeader, fmtTime } from "@/components/DoctorUi";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { ClinicalCard, EmptyState, ScreenHeader, SecondaryButton, UiModal } from "@/components/ui";
import { parseIso, useDoctorBoard, useNow } from "@/hooks/useDoctorBoard";
import { theme } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import {
  SLOT_MINUTES,
  isPendingStatus,
  patientAvatarFor,
  patientDisplayFor,
  type AppointmentRow,
} from "@/lib/db/appointments";
import {
  formatMinutes,
  hoursForDay,
  parseClinicHours,
  slotsForDay,
  startOfDay,
} from "@/utils/booking-slots";

const SLOT_MS = SLOT_MINUTES * 60 * 1000;

type Entry =
  { kind: "visit"; at: Date; row: AppointmentRow } | { kind: "free"; at: Date; end: Date };

/**
 * The day's timeline: every visit at its time, and the clinic's unbooked slots merged into "Open"
 * stretches (past ones on today are dropped — nothing left to book there).
 */
function buildTimeline(visits: AppointmentRow[], slots: Date[], now: number): Entry[] {
  const entries: Entry[] = [];
  const times = visits
    .map((row) => ({ row, at: parseIso(row.scheduled_at) }))
    .filter((v): v is { row: AppointmentRow; at: Date } => v.at !== null);
  for (const v of times) entries.push({ kind: "visit", at: v.at, row: v.row });

  let run: { at: Date; end: Date } | null = null;
  const flush = () => {
    if (run) entries.push({ kind: "free", ...run });
    run = null;
  };
  for (const s of slots) {
    const end = new Date(s.getTime() + SLOT_MS);
    const busy = times.some((v) => Math.abs(v.at.getTime() - s.getTime()) < SLOT_MS);
    if (busy || end.getTime() <= now) {
      flush();
      continue;
    }
    if (run && run.end.getTime() === s.getTime()) run.end = end;
    else {
      flush();
      run = { at: s, end };
    }
  }
  flush();
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export default function DoctorSchedule() {
  const board = useDoctorBoard();
  const { doctor, rows, patientNames, patientAvatars, loading, refreshing, error, refresh } = board;
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, scrollIntoView } = useCoachScroller(scrollRef);
  const now = useNow();

  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(new Date()));
  const hours = useMemo(() => parseClinicHours(doctor?.clinicHours), [doctor?.clinicHours]);

  const scheduled = useMemo(
    () =>
      rows
        .filter((r) => r.status === "scheduled")
        .sort(
          (a, b) =>
            (parseIso(a.scheduled_at)?.getTime() ?? 0) - (parseIso(b.scheduled_at)?.getTime() ?? 0),
        ),
    [rows],
  );
  const pending = useMemo(() => rows.filter((r) => isPendingStatus(r.status)), [rows]);

  const visitCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of scheduled) {
      const d = parseIso(r.scheduled_at);
      if (d) m.set(dayKey(d), (m.get(dayKey(d)) ?? 0) + 1);
    }
    return m;
  }, [scheduled]);
  const requestDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of pending) {
      const d = parseIso(r.preferred_time);
      if (d) keys.add(dayKey(d));
    }
    return keys;
  }, [pending]);

  const isTodaySelected = sameDay(selectedDay, new Date(now));
  const dayVisits = scheduled.filter((r) => {
    const d = parseIso(r.scheduled_at);
    return d ? sameDay(d, selectedDay) : false;
  });
  // Visits from earlier days never closed out — surfaced on today only.
  const overdue = isTodaySelected
    ? scheduled.filter((r) => {
        const d = parseIso(r.scheduled_at);
        return d ? d.getTime() < startOfDay(new Date(now)).getTime() : false;
      })
    : [];
  const dayRequests = pending.filter((r) => {
    const d = parseIso(r.preferred_time);
    return d ? sameDay(d, selectedDay) : false;
  });

  const dayHours = hoursForDay(selectedDay, hours);
  const timeline = buildTimeline(dayVisits, slotsForDay(selectedDay, hours), now);

  const dayTitle = selectedDay.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

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
            onRefresh={refresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        <FadeItem index={0}>
          <View className="mt-2">
            <ScreenHeader title="Schedule" subtitle={doctor?.clinicName} />
          </View>
        </FadeItem>

        <FadeItem index={1}>
          <CoachTarget id="doctor.schedule" scrollIntoView={scrollIntoView} className="mt-4">
            <DoctorWeekCalendar
              selectedDay={selectedDay}
              onSelect={(d) => setSelectedDay(startOfDay(d))}
              visitCounts={visitCounts}
              requestDayKeys={requestDayKeys}
              closedDays={hours.closedDays}
            />
          </CoachTarget>
        </FadeItem>

        {/* Day summary */}
        <FadeItem index={2}>
          <View className="mt-5">
            <Text className="font-bold text-[18px]" style={{ color: theme.colors.ink }}>
              {dayTitle}
            </Text>
            <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.muted }}>
              {dayHours
                ? `${formatMinutes(dayHours.openMin)} – ${formatMinutes(dayHours.closeMin)}`
                : "Clinic closed"}
              {!loading && dayVisits.length > 0
                ? ` · ${dayVisits.length} ${dayVisits.length === 1 ? "visit" : "visits"}`
                : ""}
            </Text>
          </View>
        </FadeItem>

        <View className="mt-4" key={dayKey(selectedDay)}>
          {loading ? (
            <CardListSkeleton />
          ) : error ? (
            <ClinicalCard>
              <EmptyState title="Couldn't load your schedule" copy={error} />
              <SecondaryButton label="Try again" onPress={() => void refresh()} />
            </ClinicalCard>
          ) : (
            <View className="flex-col gap-5">
              {overdue.length > 0 ? (
                <FadeItem index={3}>
                  <View className="flex-col gap-3">
                    <SectionHeader title="Past visits to mark done" count={overdue.length} />
                    {overdue.map((a) => (
                      <DoctorAppointmentCard key={a.id} {...board.cardProps(a)} compact />
                    ))}
                  </View>
                </FadeItem>
              ) : null}

              {/* Timeline */}
              {timeline.length === 0 ? (
                <FadeItem index={4}>
                  <ClinicalCard>
                    <EmptyState
                      copy={
                        !dayHours
                          ? "Your clinic is closed on this day."
                          : isTodaySelected
                            ? "Nothing left on today's schedule."
                            : "No visits booked."
                      }
                    />
                  </ClinicalCard>
                </FadeItem>
              ) : (
                <View className="flex-col">
                  {timeline.map((e, i) => (
                    <FadeItem key={`${e.kind}-${e.at.getTime()}`} index={Math.min(4 + i, 10)}>
                      <TimelineRow
                        at={e.at}
                        last={i === timeline.length - 1}
                        live={
                          e.kind === "visit" &&
                          now >= e.at.getTime() &&
                          now < e.at.getTime() + SLOT_MS
                        }
                      >
                        {e.kind === "visit" ? (
                          <DoctorAppointmentCard
                            {...board.cardProps(e.row)}
                            compact
                            showTime={false}
                          />
                        ) : (
                          <Text className="text-[13px]" style={{ color: theme.colors.faint }}>
                            Open until {fmtTime(e.end)}
                          </Text>
                        )}
                      </TimelineRow>
                    </FadeItem>
                  ))}
                </View>
              )}

              {/* Pending requests asking for this day */}
              {dayRequests.length > 0 ? (
                <FadeItem index={6}>
                  <View className="flex-col gap-2">
                    <SectionHeader title="Requested for this day" count={dayRequests.length} />
                    <ClinicalCard style={{ paddingVertical: 4 }}>
                      {dayRequests.map((r, i) => {
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
                                  ? fmtTime(t)
                                  : "Any time"
                            }
                            divider={i > 0}
                            onPress={() => router.navigate("/doctor/requests")}
                          />
                        );
                      })}
                    </ClinicalCard>
                  </View>
                </FadeItem>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      <UiModal
        visible={board.actionError !== null}
        onDismiss={board.dismissActionError}
        title={board.actionErrorTitle}
        message={board.actionError ?? ""}
        actions={[{ label: "OK", kind: "primary", onPress: board.dismissActionError }]}
      />
    </SafeAreaView>
  );
}

/** Thin rail + dot on the left; the time sits above the entry so cards keep their full width. */
function TimelineRow({
  at,
  last,
  live,
  children,
}: {
  at: Date;
  last: boolean;
  live: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row" style={{ gap: 10 }}>
      <View className="items-center" style={{ width: 12 }}>
        <View
          className="rounded-full mt-1"
          style={{
            width: 10,
            height: 10,
            backgroundColor: live ? theme.colors.primary : theme.colors.card,
            borderWidth: 2,
            borderColor: theme.colors.primary,
          }}
        />
        {!last ? (
          <View
            className="flex-1 mt-1"
            style={{ width: 2, backgroundColor: theme.colors.cardBorder }}
          />
        ) : null}
      </View>
      <View className="flex-1" style={{ paddingBottom: last ? 0 : 16 }}>
        <View className="flex-row items-center gap-2 mb-2">
          <Text
            className="text-[13px] font-bold"
            style={{ color: live ? theme.colors.primary : theme.colors.ink }}
          >
            {fmtTime(at)}
          </Text>
          {live ? (
            <Text className="text-[13px] font-semibold" style={{ color: theme.colors.primary }}>
              Now
            </Text>
          ) : null}
        </View>
        {children}
      </View>
    </View>
  );
}
