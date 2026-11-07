import type React from "react";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { router } from "expo-router";
import {
  Bell,
  Sun,
  CloudSun,
  Moon,
  ChevronRight,
  ArrowRight,
  Scan,
  MessageSquare,
  TrendingUp,
  ShieldAlert,
  CalendarCheck,
} from "lucide-react-native";

import { LinearGradient } from "expo-linear-gradient";
import CircularProgress from "@/components/CircularProgress";
import { FadeItem } from "@/components/FadeItem";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { CoachTarget } from "@/components/TutorialCoach";
import {
  ClinicalCard,
  EmptyState,
  GradientHeroCta,
  IconBadge,
  SectionTitle,
} from "@/components/ui";
import { useCoachScroller, useFocusTrigger } from "@/hooks";
import { cardShadow, theme } from "@/lib/theme";
import { useNotifications } from "@/hooks/useNotifications";
import {
  getLatestResult,
  getLatestRoutine,
  getSkinProfile,
  getTodayProgress,
  getUserProfile,
  toggleStep as toggleStepDb,
} from "@/lib/db";
import type {
  Period,
  Routine,
  RoutineStep,
  Result,
  SkinProfile,
  UserProfile,
} from "@/types/schema";
import { formatter, displayName } from "@/utils/formatter";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { formatScore } from "@/utils/detection-score";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import { ScreenGradient } from "@/components/ScreenGradient";
import { UrgentCareModal } from "@/components/UrgentCareModal";
import {
  markUrgentCareReminded,
  needsUrgentCare,
  resetUrgentCareReminder,
  shouldRemindUrgentCare,
} from "@/utils/urgent-care";
import { haptics } from "@/lib/haptics";
import {
  PeriodPanel,
  PeriodTabs,
  RoutineCompleteBanner,
  RoutineStepNode,
} from "@/components/TodayRoutine";

const PERIOD_ORDER: Period[] = ["morning", "afternoon", "evening"];

// Mascot pops up from behind the score card's top edge.
const MASCOT_W = 100;
const MASCOT_ASPECT = 1024 / 807; // width / height of the cropped PNG
const MASCOT_H = MASCOT_W / MASCOT_ASPECT;
const MASCOT_OVERLAP = 5; // px the fingers hang over the card's top edge

const PERIOD_CONFIG: Record<
  Period,
  {
    label: string;
    short: string;
    icon: typeof Sun;
    key: keyof Routine;
  }
> = {
  morning: { label: "Morning Routine", short: "Morning", icon: Sun, key: "morning_routine" },
  afternoon: {
    label: "Afternoon Routine",
    short: "Afternoon",
    icon: CloudSun,
    key: "afternoon_routine",
  },
  evening: { label: "Evening Routine", short: "Evening", icon: Moon, key: "evening_routine" },
};

// Same boundaries as the header greeting, so "Good evening" opens the
// evening routine instead of always landing on morning.
const getCurrentPeriod = (): Period => {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
};

export default function Home() {
  const focusTrigger = useFocusTrigger();
  // Lets the tutorial scroll a target back into view — this screen's
  // targets live inside the ScrollView and the tour blocks scrolling.
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, scrollIntoView } = useCoachScroller(scrollRef);
  const { unreadCount, generateNotifications } = useNotifications();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [skinProfile, setSkinProfile] = useState<SkinProfile | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingResult, setLoadingResult] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Scan photos are blurred on the dashboard until tapped, so a glance at
  // the phone doesn't expose a close-up of the user's face.
  const [revealPhoto, setRevealPhoto] = useState(false);
  const [urgentVisible, setUrgentVisible] = useState(false);

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [routineId, setRoutineId] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  // In-flight toggles: a fast second tap would otherwise compute its state from the stale
  // `completedSteps` closure and land the two DB writes out of order.
  const [pendingSteps, setPendingSteps] = useState<Set<string>>(new Set());
  const [loadingRoutine, setLoadingRoutine] = useState(true);
  const [activePeriod, setActivePeriod] = useState<Period>(getCurrentPeriod);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Good morning";
    } else if (hour < 18) {
      return "Good afternoon";
    } else {
      return "Good evening";
    }
  };
  const fetchUserProfile = async () => {
    try {
      setUserProfile(await getUserProfile());
    } catch (err) {
      console.error("Error fetching user profile:", err);
    } finally {
      setLoadingUser(false);
    }
  };
  const fetchSkinProfile = async () => {
    try {
      setSkinProfile(await getSkinProfile());
    } catch (err) {
      console.error("Error fetching skin profile:", err);
    }
  };
  const fetchResult = async () => {
    try {
      const latest = await getLatestResult();
      setResult(latest);
      // Keep reminding while the latest scan is severe and no dermatologist
      // has reviewed it yet; a newer non-severe scan or a review stops it.
      const reviewed =
        latest?.validation_status === "confirmed" || latest?.validation_status === "needs_review";
      if (
        shouldRemindUrgentCare() &&
        !reviewed &&
        needsUrgentCare(latest?.detection_label, latest?.survey_answers)
      ) {
        markUrgentCareReminded();
        setUrgentVisible(true);
      }
    } catch (err) {
      console.error("Error fetching result:", err);
    } finally {
      setLoadingResult(false);
    }
  };
  const fetchRoutine = async () => {
    setLoadingRoutine(true);
    try {
      const data = await getLatestRoutine();
      if (!data) {
        setRoutine(null);
        setRoutineId(null);
        setCompletedSteps(new Set());
        return;
      }
      setRoutine(data.routine);
      setRoutineId(data.id);
      setCompletedSteps(await getTodayProgress(data.id));
    } catch (err) {
      console.error("Error fetching routine:", err);
      setRoutine(null);
    } finally {
      setLoadingRoutine(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([
      fetchUserProfile(),
      fetchSkinProfile(),
      fetchResult(),
      fetchRoutine(),
      generateNotifications(),
    ]);
  };

  useEffect(() => {
    // Fetch-on-focus effect: setState happens in async continuations after
    // awaits, not synchronously — the extra render pass is inherent to loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    // loadAll is intentionally re-created each render; this effect must only
    // re-run when the screen regains focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTrigger]);

  // Re-arm the urgent-care reminder each time the app comes back to the
  // foreground, so it shows on every app open, not just cold starts.
  useEffect(() => {
    let prev = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (prev.match(/inactive|background/) && next === "active") {
        resetUrgentCareReminder();
        fetchResult();
      }
      prev = next;
    });
    return () => sub.remove();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  };
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

    // Feedback fires with the optimistic UI, not after the DB round-trip.
    if (isCurrentlyDone) {
      haptics.soft();
    } else {
      const steps = stepsFor(period);
      const doneAfter = steps.filter((s) => completedSteps.has(`${period}-${s.step}`)).length + 1;
      if (steps.length > 0 && doneAfter === steps.length) haptics.success();
      else haptics.tap();
    }

    try {
      if (routineId == null) throw new Error("Missing routine");
      await toggleStepDb(routineId, period, step, isCurrentlyDone);
    } catch (err) {
      console.error("Error toggling step:", err);
      haptics.error();
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

  const stepsFor = (period: Period): RoutineStep[] =>
    routine ? ((routine[PERIOD_CONFIG[period].key] as RoutineStep[]) ?? []) : [];
  const periodStats = Object.fromEntries(
    PERIOD_ORDER.map((period) => {
      const steps = stepsFor(period);
      const done = steps.filter((s) => completedSteps.has(`${period}-${s.step}`)).length;
      return [period, { done, total: steps.length }];
    }),
  ) as Record<Period, { done: number; total: number }>;

  const activeSteps = stepsFor(activePeriod);
  const { done: completedCount, total: totalCount } = periodStats[activePeriod];
  const periodComplete = totalCount > 0 && completedCount === totalCount;

  const scoreExplanation = result
    ? getHealthScoreResponse(Number(result.healthscore) || 0, {
        skin_type: skinProfile?.skin_type ?? "",
        main_concern: skinProfile?.main_concerns ?? "",
      }).shortMessage
    : "";

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: theme.colors.background }}
    >
      <ScreenGradient />
      <UrgentCareModal visible={urgentVisible} onClose={() => setUrgentVisible(false)} />
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
          <CoachTarget id="home.header" scrollIntoView={scrollIntoView}>
            <View className="flex-row items-center justify-between mt-2">
              <View className="flex-col">
                <Text className="font-semibold text-[13px]" style={{ color: theme.colors.muted }}>
                  {getGreeting()}
                </Text>
                {loadingUser ? (
                  <Skeleton className="h-7 w-40 mt-1 rounded-lg" />
                ) : (
                  <Text
                    className="font-bold text-[24px] mt-0.5"
                    style={{ color: theme.colors.ink }}
                  >
                    {displayName(userProfile?.first_name || userProfile?.username) || "Welcome"}
                  </Text>
                )}
              </View>
              <Pressable
                className="h-11 w-11 items-center justify-center rounded-full bg-white active:opacity-80"
                style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
                onPress={() => router.push("/(modules)/notifications")}
                accessibilityRole="button"
                accessibilityLabel={
                  unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
                }
                hitSlop={8}
              >
                <Bell size={20} color={theme.colors.primary} />
                {unreadCount > 0 && (
                  <View
                    className="absolute top-1.5 right-1.5 h-3 w-3 rounded-full border border-white"
                    style={{ backgroundColor: theme.colors.danger }}
                  />
                )}
              </Pressable>
            </View>
          </CoachTarget>
        </FadeItem>

        {/* Skin health score */}
        <FadeItem index={1}>
          {/* mt-10 (was mt-5) leaves headroom for the mascot above the card */}
          <View className="mt-10">
            <SectionTitle title="Skin Health" />
          </View>
        </FadeItem>
        <FadeItem index={2}>
          <CoachTarget id="home.score" scrollIntoView={scrollIntoView}>
            <View>
              {loadingResult ? (
                <LinearGradient
                  colors={[...theme.gradients.dark]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  className="flex-row items-center gap-4 mt-2.5 px-4 py-4"
                  style={{ borderRadius: theme.radius.card, ...cardShadow }}
                >
                  <Skeleton className="h-[68px] w-[68px] rounded-full" />
                  <View className="flex-col flex-1 gap-2">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="h-3 w-28 rounded-md" />
                    <Skeleton className="h-3 w-44 rounded-md" />
                    <Skeleton className="h-3 w-32 rounded-md" />
                    <Skeleton className="h-8 w-24 rounded-full" />
                  </View>
                </LinearGradient>
              ) : (
                <LinearGradient
                  colors={[...theme.gradients.dark]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  className="flex-row items-center gap-4 mt-2.5 px-4 py-4"
                  style={{ borderRadius: theme.radius.card, ...cardShadow }}
                >
                  <CircularProgress
                    progress={Number(result?.healthscore ?? 0)}
                    size={76}
                    strokeWidth={8}
                    color="#FFFFFF"
                    trackColor="rgba(255,255,255,0.25)"
                  >
                    <View className="items-center">
                      <Text className="text-lg font-bold leading-5" style={{ color: "#FFFFFF" }}>
                        {result?.healthscore != null ? Math.round(result.healthscore) : "--"}
                      </Text>
                      <Text
                        className="text-[10px] font-semibold"
                        style={{ color: "rgba(255,255,255,0.75)" }}
                      >
                        /100
                      </Text>
                    </View>
                  </CircularProgress>
                  <View className="flex-col flex-1">
                    <Text
                      className="text-[11px] font-bold uppercase"
                      style={{ color: "#BBF7D0", letterSpacing: 1 }}
                    >
                      Health Score
                    </Text>
                    <Text className="font-bold text-[16px] mt-0.5" style={{ color: "#FFFFFF" }}>
                      {formatter(result?.severity ?? "—")} Progress
                    </Text>
                    {scoreExplanation ? (
                      <Text
                        className="text-[11px] mt-1 leading-4"
                        style={{ color: "rgba(255,255,255,0.85)" }}
                      >
                        {scoreExplanation}
                      </Text>
                    ) : null}
                    <Pressable
                      className="rounded-full self-start mt-2.5 active:opacity-80 bg-white px-4 py-1.5"
                      style={{ borderRadius: 999 }}
                      onPress={() => router.push("/(modules)/progress")}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: theme.colors.primaryDeep }}
                      >
                        View Progress
                      </Text>
                    </Pressable>
                  </View>
                </LinearGradient>
              )}

              {/* Mascot popping up from behind the card's top edge */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  right: 10,
                  // card has mt-2.5 (10px), so its top edge sits 10px below this wrapper's top
                  top: 10 - (MASCOT_H - MASCOT_OVERLAP),
                  width: MASCOT_W,
                  height: MASCOT_H,
                  zIndex: 10,
                  elevation: 10, // Android: keeps her above the card's shadow/elevation
                }}
              >
                <Image
                  source={require("@/assets/images/others/7.png")}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="contain"
                />
              </View>
            </View>
          </CoachTarget>
        </FadeItem>

        {/* Routine (paginated: morning / afternoon / evening) */}
        <FadeItem index={3}>
          <View className="mt-5">
            <SectionTitle
              title="Today's Routine"
              actionLabel={routine ? "See all" : undefined}
              onAction={() => router.push("/(tabs)/routine")}
            />
          </View>
        </FadeItem>
        <FadeItem index={4}>
          <CoachTarget id="home.routine" scrollIntoView={scrollIntoView}>
            {loadingRoutine ? (
              <ClinicalCard className="mt-2.5 flex-col gap-4">
                <Skeleton className="h-12 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </ClinicalCard>
            ) : !routine ? (
              /* No routine generated yet — point to the scan that creates one */
              <ClinicalCard className="mt-2.5 items-center">
                <EmptyState
                  title="No routine yet"
                  copy="Scan your skin and we'll build a morning, afternoon and evening routine for you."
                />
                <Pressable
                  onPress={() => router.push("/(tabs)/scan")}
                  accessibilityRole="button"
                  className="rounded-full px-5 py-2 -mt-3 active:opacity-80"
                  style={{ backgroundColor: theme.colors.primary }}
                >
                  <Text className="text-xs font-bold" style={{ color: "#FFFFFF" }}>
                    Scan your skin
                  </Text>
                </Pressable>
              </ClinicalCard>
            ) : (
              <ClinicalCard className="mt-2.5 flex-col gap-4">
                {/* Segmented control — thumb slides, every period's status visible */}
                <PeriodTabs
                  activeKey={activePeriod}
                  onChange={(key) => setActivePeriod(key as Period)}
                  tabs={PERIOD_ORDER.map((period) => {
                    const { done, total } = periodStats[period];
                    return {
                      key: period,
                      label: PERIOD_CONFIG[period].short,
                      icon: PERIOD_CONFIG[period].icon,
                      done,
                      total,
                      a11yLabel: `${PERIOD_CONFIG[period].label}, ${
                        total === 0
                          ? "no steps"
                          : done === total
                            ? "complete"
                            : `${done} of ${total} done`
                      }`,
                    };
                  })}
                />

                {/* One cross-fade per period switch; steps don't re-stagger */}
                <PeriodPanel periodKey={activePeriod}>
                  {totalCount === 0 ? (
                    <EmptyState
                      copy={`No ${PERIOD_CONFIG[activePeriod].short.toLowerCase()} steps today.`}
                    />
                  ) : (
                    <>
                      <View className="flex-row items-start">
                        {activeSteps.map((item, index) => {
                          const isDoneAt = (i: number) =>
                            completedSteps.has(`${activePeriod}-${activeSteps[i].step}`);
                          const key = `${activePeriod}-${item.step}`;
                          const isFirst = index === 0;
                          const isLast = index === activeSteps.length - 1;
                          return (
                            <RoutineStepNode
                              key={item.step}
                              index={index}
                              label={item.product_type}
                              isDone={completedSteps.has(key)}
                              isPending={pendingSteps.has(key)}
                              prevDone={!isFirst && isDoneAt(index - 1)}
                              nextDone={!isLast && isDoneAt(index + 1)}
                              isFirst={isFirst}
                              isLast={isLast}
                              onPress={() => handleToggleStep(activePeriod, item.step)}
                            />
                          );
                        })}
                      </View>

                      {periodComplete ? (
                        <RoutineCompleteBanner label={PERIOD_CONFIG[activePeriod].short} />
                      ) : null}
                    </>
                  )}
                </PeriodPanel>
              </ClinicalCard>
            )}
          </CoachTarget>
        </FadeItem>

        {/* Quick AI Scan — dark gradient hero */}
        <FadeItem index={5}>
          <View className="mt-5">
            <SectionTitle title="Quick Actions" />
          </View>
        </FadeItem>
        <FadeItem index={6}>
          <CoachTarget id="home.scan" scrollIntoView={scrollIntoView}>
            <GradientHeroCta
              title="Scan Your Skin"
              subtitle="Take or upload a photo"
              onPress={() => router.push("/(tabs)/scan")}
              accessibilityLabel="Scan your skin"
              className="mt-2.5"
              accessory={
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  <ArrowRight size={16} color="white" />
                </View>
              }
            />
          </CoachTarget>
        </FadeItem>

        {/* Chatbot, Progress, Sensitivity & Appointments quick actions */}
        <FadeItem index={7}>
          <View className="flex-row gap-3 mt-3">
            <Pressable
              className="flex-1 active:opacity-90"
              onPress={() => router.push("/(modules)/chatbot")}
            >
              <ClinicalCard className="items-center gap-2">
                <IconBadge icon={MessageSquare} size="lg" tone="soft" />
                <Text
                  className="font-bold text-[13px] text-center"
                  style={{ color: theme.colors.ink }}
                >
                  Ask Nerma
                </Text>
                <Text className="text-[11px] text-center" style={{ color: theme.colors.muted }}>
                  Ask skin questions
                </Text>
              </ClinicalCard>
            </Pressable>

            <Pressable
              className="flex-1 active:opacity-90"
              onPress={() => router.push("/(modules)/progress")}
            >
              <ClinicalCard className="items-center gap-2">
                <IconBadge icon={TrendingUp} size="lg" tone="soft" />
                <Text
                  className="font-bold text-[13px] text-center"
                  style={{ color: theme.colors.ink }}
                >
                  Progress
                </Text>
                <Text className="text-[11px] text-center" style={{ color: theme.colors.muted }}>
                  Track your skin
                </Text>
              </ClinicalCard>
            </Pressable>
          </View>

          <View className="flex-row gap-3 mt-3">
            <Pressable
              className="flex-1 active:opacity-90"
              onPress={() => router.push("/(modules)/sensitivity")}
            >
              <ClinicalCard className="items-center gap-2">
                <IconBadge icon={ShieldAlert} size="lg" tone="soft" />
                <Text
                  className="font-bold text-[13px] text-center"
                  style={{ color: theme.colors.ink }}
                >
                  Sensitivity
                </Text>
                <Text className="text-[11px] text-center" style={{ color: theme.colors.muted }}>
                  Skin sensitivity
                </Text>
              </ClinicalCard>
            </Pressable>

            <Pressable
              className="flex-1 active:opacity-90"
              onPress={() => router.push("/(modules)/appointments")}
            >
              <ClinicalCard className="items-center gap-2">
                <IconBadge icon={CalendarCheck} size="lg" tone="soft" />
                <Text
                  className="font-bold text-[13px] text-center"
                  style={{ color: theme.colors.ink }}
                >
                  Appointments
                </Text>
                <Text className="text-[11px] text-center" style={{ color: theme.colors.muted }}>
                  Book & track visits
                </Text>
              </ClinicalCard>
            </Pressable>
          </View>
        </FadeItem>

        {/* Last scan result */}
        <FadeItem index={8}>
          <View className="mt-5">
            <SectionTitle
              title="Last Scan"
              meta={
                loadingResult
                  ? undefined
                  : result?.created_at
                    ? new Date(result.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "No scans yet"
              }
            />
          </View>
        </FadeItem>
        <FadeItem index={9}>
          {loadingResult ? (
            <ClinicalCard className="mt-2.5">
              <View className="flex-row items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-2xl" />
                <View className="flex-col flex-1 gap-1">
                  <Skeleton className="h-4 w-40 rounded-md" />
                  <Skeleton className="h-3 w-24 rounded-md" />
                </View>
              </View>
            </ClinicalCard>
          ) : (
            <ClinicalCard className="mt-2.5">
              {result ? (
                <View className="flex-row items-center gap-3">
                  {result.image_url ? (
                    <Pressable
                      onPress={() => setRevealPhoto((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel={revealPhoto ? "Hide scan photo" : "Show scan photo"}
                      className="h-12 w-12 rounded-2xl overflow-hidden"
                      style={{ backgroundColor: theme.colors.primarySoft }}
                    >
                      <Image
                        source={{ uri: result.image_url }}
                        className="w-full h-full"
                        resizeMode="cover"
                        blurRadius={revealPhoto ? 0 : 14}
                      />
                    </Pressable>
                  ) : (
                    <IconBadge icon={Scan} size="md" tone="soft" />
                  )}
                  <View className="flex-col flex-1">
                    <Text className="text-sm font-semibold" style={{ color: theme.colors.ink }}>
                      {formatter(result.detection_label ?? result.severity)} ·{" "}
                      {formatScore(result.healthscore)}
                    </Text>
                    <Text
                      className="text-xs mt-0.5"
                      style={{ color: theme.colors.muted }}
                      numberOfLines={1}
                    >
                      {[
                        formatter(result.severity),
                        result.confidence
                          ? `${Math.round(result.confidence * 100)}% AI confidence`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    {result.validation_status === "confirmed" ||
                    result.validation_status === "needs_review" ? (
                      <Text
                        className="text-xs font-bold"
                        style={{
                          color:
                            result.validation_status === "confirmed"
                              ? theme.colors.primary
                              : "#B45309",
                        }}
                      >
                        {result.validation_status === "confirmed"
                          ? "Dermatologist confirmed"
                          : "Flagged for follow-up"}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    className="active:opacity-70 p-2 -m-2"
                    accessibilityRole="button"
                    accessibilityLabel="View scan history"
                    onPress={() => router.push("/(modules)/progress")}
                  >
                    <ChevronRight size={18} color={theme.colors.faint} />
                  </Pressable>
                </View>
              ) : (
                <EmptyState copy="No scans yet." />
              )}
            </ClinicalCard>
          )}
        </FadeItem>
      </ScrollView>
    </SafeAreaView>
  );
}
