import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { Sun, CloudSun, Moon, Check } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import { FadeItem } from "@/components/FadeItem";
import InlineProgress from "@/components/InlineProgress";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { CoachTarget } from "@/components/TutorialCoach";
import { theme, cardShadow } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import { ClinicalCard, EmptyState, ScreenHeader } from "@/components/ui";
import { useFocusTrigger } from "@/hooks/useFocusTrigger";
import { useCoachScroller } from "@/hooks/useCoachScroller";
import { getLatestRoutine, getTodayProgress, toggleStep as toggleStepDb } from "@/lib/db";
import type { Period, Routine, RoutineStep } from "@/types/schema";
import { ScreenGradient } from "@/components/ScreenGradient";
import { RecommendedProductBody } from "@/components/RecommendedProduct";

type IconComponent = typeof Sun;

const PERIOD_CONFIG: Record<Period, { label: string; icon: IconComponent; key: keyof Routine }> = {
  morning: { label: "Morning", icon: Sun, key: "morning_routine" },
  afternoon: {
    label: "Afternoon",
    icon: CloudSun,
    key: "afternoon_routine",
  },
  evening: { label: "Evening", icon: Moon, key: "evening_routine" },
};

// Matches the greeting buckets on the Home tab: before noon is morning,
// until 6pm is afternoon, everything after is evening.
const periodForNow = (): Period => {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
};

export default function Routines() {
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [routineId, setRoutineId] = useState<number | null>(null);
  const [loadingRoutine, setLoadingRoutine] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activePeriod, setActivePeriod] = useState<Period>(periodForNow);
  // Once the user taps a period themselves, stop re-syncing to the clock.
  const manualPeriod = useRef(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [pendingSteps, setPendingSteps] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const focusTrigger = useFocusTrigger();
  // Tab screens keep their scroll offset between visits, so the tutorial
  // needs to be able to scroll its target back into view.
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, scrollIntoView } = useCoachScroller(scrollRef);
  const fetchRoutine = async () => {
    setLoadingRoutine(true);
    setLoadError(false);
    try {
      const data = await getLatestRoutine();
      if (!data) {
        setRoutine(null);
        setRoutineId(null);
        setCompletedSteps(new Set());
      } else {
        setRoutine(data.routine);
        setRoutineId(data.id);
        setCompletedSteps(await getTodayProgress(data.id));
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoadingRoutine(false);
    }
  };
  useEffect(() => {
    // Sync-on-focus: tab screens stay mounted between visits, so the default period must follow the
    // clock whenever the screen regains focus — unless the user picked one by hand.
    if (!manualPeriod.current) setActivePeriod(periodForNow());
    // Fetch-on-focus effect: setState happens in async continuations after
    // awaits, not synchronously — the extra render pass is inherent to loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRoutine();
  }, [focusTrigger]);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchRoutine();
    } finally {
      setRefreshing(false);
    }
  };
  const activeSteps = routine ? (routine[PERIOD_CONFIG[activePeriod].key] as RoutineStep[]) : [];
  const allSteps = useMemo(() => {
    if (!routine) return [];
    return [
      ...routine.morning_routine.map((s) => ({
        ...s,
        period: "morning" as Period,
      })),
      ...routine.afternoon_routine.map((s) => ({
        ...s,
        period: "afternoon" as Period,
      })),
      ...routine.evening_routine.map((s) => ({
        ...s,
        period: "evening" as Period,
      })),
    ];
  }, [routine]);
  const totalSteps = allSteps.length;
  // Only count completions that map to a step in the current routine, so a
  // stale key can never push the count past the total.
  const doneCount = allSteps.filter((s) => completedSteps.has(`${s.period}-${s.step}`)).length;
  // The headline count follows the selected tab (what's on screen); the
  // whole-day total is shown as secondary context.
  const periodTotal = activeSteps.length;
  const periodDone = activeSteps.filter((s) =>
    completedSteps.has(`${activePeriod}-${s.step}`),
  ).length;
  const progressPct = periodTotal > 0 ? Math.round((periodDone / periodTotal) * 100) : 0;
  const handleToggleStep = async (period: Period, step: number) => {
    const key = `${period}-${step}`;
    if (pendingSteps.has(key)) return;
    const isCurrentlyDone = completedSteps.has(key);
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (isCurrentlyDone) next.delete(key);
      else next.add(key);
      return next;
    });
    setPendingSteps((prev) => new Set(prev).add(key));
    try {
      if (routineId == null) throw new Error("Missing routine id");
      await toggleStepDb(routineId, period, step, isCurrentlyDone);
    } catch {
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        if (isCurrentlyDone) next.add(key);
        else next.delete(key);
        return next;
      });
    } finally {
      setPendingSteps((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };
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
        {/* Title + Period tabs - skeleton first */}
        {loadingRoutine ? (
          <View>
            <Skeleton className="h-7 w-32 rounded-lg" />
            <Skeleton className="h-4 w-48 mt-1 rounded-md" />
            <View className="flex-row gap-2 mt-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 flex-1 rounded-full" />
              ))}
            </View>
            <View className="flex-col gap-3 mt-5">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </View>
          </View>
        ) : (
          <>
            <FadeItem index={0}>
              <View className="mt-2">
                <ScreenHeader title="My Routine" subtitle="Today's steps" />
              </View>
            </FadeItem>

            <FadeItem index={1}>
              <CoachTarget
                id="routine.periods"
                className="flex-row items-center gap-2 mt-5 p-1 rounded-full bg-white"
                style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, ...cardShadow }}
                scrollIntoView={scrollIntoView}
              >
                {(Object.keys(PERIOD_CONFIG) as Period[]).map((period) => {
                  const { label, icon: Icon } = PERIOD_CONFIG[period];
                  const isActive = activePeriod === period;
                  return (
                    <Pressable
                      key={period}
                      onPress={() => {
                        manualPeriod.current = true;
                        setActivePeriod(period);
                      }}
                      className="flex-1 rounded-full active:opacity-80"
                      style={{ borderRadius: 999, overflow: "hidden" }}
                    >
                      {isActive ? (
                        <LinearGradient
                          colors={[...theme.gradients.dark]}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          className="py-2.5 flex-row justify-center items-center gap-1.5"
                        >
                          <Icon size={14} color="#FFFFFF" />
                          <Text className="text-center font-bold text-[13px] text-white">
                            {label}
                          </Text>
                        </LinearGradient>
                      ) : (
                        <View className="py-2.5 flex-row justify-center items-center gap-1.5">
                          <Icon size={14} color={theme.colors.muted} />
                          <Text
                            className="text-center font-bold text-[13px]"
                            style={{ color: theme.colors.muted }}
                          >
                            {label}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </CoachTarget>
            </FadeItem>

            {/* Progress */}
            <FadeItem index={2}>
              {routine && periodTotal > 0 && (
                <ClinicalCard className="mt-4">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-bold" style={{ color: theme.colors.ink }}>
                      {periodDone}/{periodTotal} {PERIOD_CONFIG[activePeriod].label.toLowerCase()}{" "}
                      steps done
                    </Text>
                    <Text className="text-xs" style={{ color: theme.colors.muted }}>
                      {doneCount}/{totalSteps} today
                    </Text>
                  </View>
                  <View className="mt-2">
                    <InlineProgress
                      progress={progressPct}
                      height={8}
                      color={theme.colors.primary}
                      trackColor={theme.colors.primarySoft}
                    />
                  </View>
                </ClinicalCard>
              )}
            </FadeItem>

            {/* Steps */}
            <View className="flex-col gap-3 mt-4">
              {loadError ? (
                <ClinicalCard>
                  <EmptyState
                    title="Couldn't load routine"
                    copy="Check your connection and try again."
                  />
                </ClinicalCard>
              ) : !routine ? (
                <ClinicalCard>
                  <EmptyState title="No routine yet" copy="No routine saved yet." />
                </ClinicalCard>
              ) : activeSteps.length === 0 ? (
                <ClinicalCard>
                  <EmptyState
                    copy={`No ${PERIOD_CONFIG[activePeriod].label.toLowerCase()} steps in this routine.`}
                  />
                </ClinicalCard>
              ) : (
                activeSteps.map((item, stepIdx) => {
                  const key = `${activePeriod}-${item.step}`;
                  const isDone = completedSteps.has(key);
                  const isPending = pendingSteps.has(key);
                  return (
                    <FadeItem key={key} index={Math.min(3 + stepIdx, 7)}>
                      <Pressable
                        key={key}
                        onPress={() => handleToggleStep(activePeriod, item.step)}
                        disabled={isPending}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isDone }}
                        accessibilityLabel={`${item.product_type}, ${isDone ? "completed" : "not completed"}`}
                        className="active:opacity-80"
                      >
                        <ClinicalCard
                          className={`flex-row items-start gap-3 ${
                            isDone ? "opacity-60" : ""
                          } ${isPending ? "opacity-40" : ""}`}
                        >
                          <View
                            className="h-9 w-9 rounded-full items-center justify-center mt-0.5 bg-white"
                            style={
                              isDone
                                ? { backgroundColor: theme.colors.primary }
                                : { borderWidth: 1.5, borderColor: theme.colors.primary }
                            }
                          >
                            {isDone ? (
                              <Check size={16} color="#FFFFFF" />
                            ) : (
                              <Text
                                className="font-bold text-[13px]"
                                style={{ color: theme.colors.primary }}
                              >
                                {item.step}
                              </Text>
                            )}
                          </View>
                          <View className="flex-col flex-1 gap-1">
                            <Text
                              className={`font-bold text-[15px] ${isDone ? "line-through" : ""}`}
                              style={{ color: theme.colors.ink }}
                            >
                              {item.product_type}
                            </Text>
                            <Text className="text-xs" style={{ color: theme.colors.body }}>
                              {item.instruction}
                            </Text>
                            <Text className="text-xs" style={{ color: theme.colors.faint }}>
                              {item.reason}
                            </Text>
                          </View>
                        </ClinicalCard>
                      </Pressable>
                    </FadeItem>
                  );
                })
              )}
            </View>

            {/* Recommended products */}
            <FadeItem index={8}>
              {routine && routine.recommended_products?.length > 0 && (
                <View className="mt-7 gap-3">
                  <Text className="font-bold text-[16px]" style={{ color: theme.colors.ink }}>
                    Commonly recommended products
                  </Text>
                  <Text className="text-xs leading-4 -mt-1" style={{ color: theme.colors.muted }}>
                    Often used for your concern — skin reacts differently from person to person, so
                    patch-test first and tap &quot;This irritated my skin&quot; if one doesn&apos;t
                    suit you.
                  </Text>
                  {routine.recommended_products.map((product, index) => (
                    <FadeItem key={index} index={Math.min(9 + index, 11)}>
                      <ClinicalCard key={index} className="gap-1.5">
                        <RecommendedProductBody
                          product={product}
                          onReported={() => void fetchRoutine()}
                          showEvidenceLink={false}
                        />
                      </ClinicalCard>
                    </FadeItem>
                  ))}
                </View>
              )}
            </FadeItem>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
