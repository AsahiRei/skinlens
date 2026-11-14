import { useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { Text } from "@/components/Text";
import { FadeItem } from "@/components/FadeItem";
import { CoachTarget } from "@/components/TutorialCoach";
import { useCoachScroller } from "@/hooks/useCoachScroller";
import { DoctorAppointmentCard } from "@/components/DoctorAppointmentCard";
import { CardListSkeleton, Segmented } from "@/components/DoctorUi";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { ClinicalCard, EmptyState, ScreenHeader, SecondaryButton, UiModal } from "@/components/ui";
import { parseIso, useDoctorBoard } from "@/hooks/useDoctorBoard";
import { theme } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import { isPendingStatus, type AppointmentRow } from "@/lib/db/appointments";

type Filter = "all" | "new" | "awaiting";
type Sort = "oldest" | "soonest";

const time = (iso: string | null, fallback: number) => parseIso(iso)?.getTime() ?? fallback;

/** Pending visit requests at the clinic — the doctor's inbox. */
export default function DoctorRequests() {
  const board = useDoctorBoard();
  const { rows, loading, refreshing, error, refresh } = board;
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, scrollIntoView } = useCoachScroller(scrollRef);

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("oldest");

  const pending = useMemo(() => rows.filter((r) => isPendingStatus(r.status)), [rows]);
  const counts = {
    all: pending.length,
    new: pending.filter((r) => r.status === "requested").length,
    awaiting: pending.filter((r) => r.status === "needs_reschedule").length,
  };

  const list = useMemo(() => {
    const filtered = pending.filter((r) =>
      filter === "all"
        ? true
        : filter === "new"
          ? r.status === "requested"
          : r.status === "needs_reschedule",
    );
    const byOldest = (a: AppointmentRow, b: AppointmentRow) =>
      time(a.created_at, 0) - time(b.created_at, 0);
    // Soonest requested time first; "any time" requests go last.
    const bySoonest = (a: AppointmentRow, b: AppointmentRow) =>
      time(a.preferred_time, Infinity) - time(b.preferred_time, Infinity) || byOldest(a, b);
    return [...filtered].sort(sort === "oldest" ? byOldest : bySoonest);
  }, [pending, filter, sort]);

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
            <ScreenHeader title="Requests" subtitle="Patients waiting for a visit time" />
          </View>
        </FadeItem>

        <FadeItem index={1}>
          <CoachTarget id="doctor.requests" scrollIntoView={scrollIntoView} className="mt-4 gap-3">
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { key: "all", label: "All", count: counts.all },
                { key: "new", label: "New", count: counts.new },
                { key: "awaiting", label: "Awaiting", count: counts.awaiting },
              ]}
            />
            <View className="flex-row justify-end">
              <Pressable
                onPress={() => setSort(sort === "oldest" ? "soonest" : "oldest")}
                accessibilityRole="button"
                accessibilityLabel={`Sort: ${sort === "oldest" ? "oldest request first" : "soonest requested time first"}. Tap to change.`}
                hitSlop={8}
                className="active:opacity-70"
              >
                <Text className="text-[13px] font-semibold" style={{ color: theme.colors.primary }}>
                  {sort === "oldest" ? "Oldest first" : "Soonest time"}
                </Text>
              </Pressable>
            </View>
          </CoachTarget>
        </FadeItem>

        <View className="mt-4" key={`${filter}-${sort}`}>
          {loading ? (
            <CardListSkeleton />
          ) : error ? (
            <ClinicalCard>
              <EmptyState title="Couldn't load requests" copy={error} />
              <SecondaryButton label="Try again" onPress={() => void refresh()} />
            </ClinicalCard>
          ) : list.length === 0 ? (
            <FadeItem index={2}>
              <ClinicalCard>
                <EmptyState
                  title={filter === "all" ? "Inbox zero" : "Nothing here"}
                  copy={
                    filter === "awaiting"
                      ? "No patients are picking a new time right now."
                      : "New visit requests for your clinic will show up here."
                  }
                />
              </ClinicalCard>
            </FadeItem>
          ) : (
            <View className="flex-col gap-3">
              {list.map((a, i) => (
                <FadeItem key={a.id} index={Math.min(2 + i, 8)}>
                  <DoctorAppointmentCard {...board.cardProps(a)} />
                </FadeItem>
              ))}
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
