import type React from "react";
import { useEffect, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Bell,
  Sun,
  CloudSun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Check,
  Camera,
  ArrowRight,
  MessageSquare,
  TrendingUp,
  Scan,
} from "lucide-react-native";

import { LinearGradient } from "expo-linear-gradient";
import CircularProgress from "@/components/CircularProgress";
import { FadeItem } from "@/components/FadeItem";
import InlineProgress from "@/components/InlineProgress";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  ClinicalCard,
  EmptyState,
  GradientHeroCta,
  IconBadge,
  Pill,
  SectionTitle,
} from "@/components/ui";
import { useFocusTrigger } from "@/hooks";
import { cardShadow, theme } from "@/lib/theme";
import { useNotifications } from "@/hooks/useNotifications";
import {
  getLatestResult,
  getLatestRoutine,
  getTodayProgress,
  getUserProfile,
  toggleStep as toggleStepDb,
} from "@/lib/db";
import type { Period, Routine, RoutineStep, Result, UserProfile } from "@/types/schema";
import { formatter } from "@/utils/formatter";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import { ScreenGradient } from "@/components/ScreenGradient";

const PERIOD_ORDER: Period[] = ["morning", "afternoon", "evening"];

const PERIOD_CONFIG: Record<
  Period,
  {
    label: string;
    icon: typeof Sun;
    key: keyof Routine;
  }
> = {
  morning: { label: "Morning Routine", icon: Sun, key: "morning_routine" },
  afternoon: {
    label: "Afternoon Routine",
    icon: CloudSun,
    key: "afternoon_routine",
  },
  evening: { label: "Evening Routine", icon: Moon, key: "evening_routine" },
};

export default function Home() {
  const focusTrigger = useFocusTrigger();
  const { unreadCount, generateNotifications } = useNotifications();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingResult, setLoadingResult] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [routineId, setRoutineId] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  // In-flight toggles: a fast second tap would otherwise compute its state
  // from the stale `completedSteps` closure and land the two DB writes out of
  // order. Same guard the Routine tab already uses.
  const [pendingSteps, setPendingSteps] = useState<Set<string>>(new Set());
  const [loadingRoutine, setLoadingRoutine] = useState(true);
  const [activePeriod, setActivePeriod] = useState<Period>("morning");

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
  const fetchResult = async () => {
    try {
      setResult(await getLatestResult());
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

    try {
      if (routineId == null) throw new Error("Missing routine");
      await toggleStepDb(routineId, period, step, isCurrentlyDone);
    } catch (err) {
      console.error("Error toggling step:", err);
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

  const activeSteps = routine
    ? (routine[PERIOD_CONFIG[activePeriod].key] as RoutineStep[])
    : [];
  const completedCount = activeSteps.filter((item) =>
    completedSteps.has(`${activePeriod}-${item.step}`),
  ).length;
  const totalCount = activeSteps.length;
  const routineProgress = totalCount
    ? Math.round((completedCount / totalCount) * 100)
    : 0;

  const scoreExplanation = result
    ? result.description?.trim() ||
      getHealthScoreResponse(Number(result.healthscore) || 0).message
    : "";

  const goToPeriod = (direction: -1 | 1) => {
    const currentIndex = PERIOD_ORDER.indexOf(activePeriod);
    const nextIndex =
      (currentIndex + direction + PERIOD_ORDER.length) % PERIOD_ORDER.length;
    setActivePeriod(PERIOD_ORDER[nextIndex]);
  };

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
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Header */}
        <FadeItem index={0}>
          <View className="flex-row items-center justify-between mt-2">
            <View className="flex-col">
              <Text className="font-semibold text-[13px]" style={{ color: theme.colors.muted }}>
                {getGreeting()}
              </Text>
              {loadingUser ? (
                <Skeleton className="h-7 w-40 mt-1 rounded-lg" />
              ) : (
                <Text className="font-bold text-[24px] mt-0.5" style={{ color: theme.colors.ink }}>
                  {userProfile?.first_name || userProfile?.username || "Welcome"}
                </Text>
              )}
            </View>
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-full bg-white active:opacity-80"
              style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
              onPress={() => router.push("/(modules)/notifications")}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              hitSlop={8}
            >
              <Bell size={20} color={theme.colors.primary} />
              {unreadCount > 0 && (
                <View className="absolute top-1.5 right-1.5 h-3 w-3 rounded-full border border-white" style={{ backgroundColor: theme.colors.danger }} />
              )}
            </Pressable>
          </View>
        </FadeItem>

        {/* Skin health score */}
        <FadeItem index={1}>
          <View className="mt-5">
            <SectionTitle title="Skin Health" />
          </View>
        </FadeItem>
        <FadeItem index={2}>
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
                <Text className="text-lg font-bold" style={{ color: "#FFFFFF" }}>
                  {result?.healthscore ?? 0}%
                </Text>
              </CircularProgress>
              <View className="flex-col flex-1">
                <Text className="text-[11px] font-bold uppercase" style={{ color: "#BBF7D0", letterSpacing: 1 }}>
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
                  <Text className="text-xs font-bold" style={{ color: theme.colors.primaryDeep }}>
                    View Progress
                  </Text>
                </Pressable>
              </View>
            </LinearGradient>
          )}
        </FadeItem>

        {/* Routine (paginated: morning / afternoon / evening) */}
        <FadeItem index={3}>
          <View className="mt-5">
            <SectionTitle title="Today's Routine" />
          </View>
        </FadeItem>
        <FadeItem index={4}>
          {loadingRoutine ? (
            <ClinicalCard className="mt-2.5 flex-col gap-3">
              <Skeleton className="h-5 w-36 rounded-md" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </ClinicalCard>
          ) : (
            <ClinicalCard className="mt-2.5 flex-col gap-3">
              <View className="flex-row items-center justify-between">
                <Pressable
                  onPress={() => goToPeriod(-1)}
                  hitSlop={8}
                  className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
                  style={{ backgroundColor: theme.colors.primarySoft }}
                >
                  <ChevronLeft size={16} color={theme.colors.primary} />
                </Pressable>

                <View className="flex-row items-center gap-2">
                  {(() => {
                    const Icon = PERIOD_CONFIG[activePeriod].icon;
                    return <Icon size={18} color={theme.colors.primary} />;
                  })()}
                  <Text className="font-bold text-[15px]" style={{ color: theme.colors.ink }}>
                    {PERIOD_CONFIG[activePeriod].label}
                  </Text>
                </View>

                <Pressable
                  onPress={() => goToPeriod(1)}
                  hitSlop={8}
                  className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
                  style={{ backgroundColor: theme.colors.primarySoft }}
                >
                  <ChevronRight size={16} color={theme.colors.primary} />
                </Pressable>
              </View>

              <View className="flex-row items-center justify-center gap-1.5">
                {PERIOD_ORDER.map((period) => (
                  <View
                    key={period}
                    className={`h-1.5 rounded-full ${
                      period === activePeriod ? "w-6" : "w-1.5"
                    }`}
                    style={{
                      backgroundColor:
                        period === activePeriod
                          ? theme.colors.primary
                          : theme.colors.cardBorder,
                    }}
                  />
                ))}
              </View>

              {totalCount > 0 && (
                <View className="self-center">
                  <Pill label={`${completedCount} / ${totalCount} done`} />
                </View>
              )}

              {totalCount === 0 ? (
                <EmptyState
                  icon={Scan}
                  copy={`No ${PERIOD_CONFIG[activePeriod].label.toLowerCase()} steps.`}
                />
              ) : (
                <>
                  <InlineProgress
                    progress={routineProgress}
                    height={8}
                    color={theme.colors.primary}
                    trackColor={theme.colors.primarySoft}
                  />

                  <View className="flex-row items-start justify-between gap-2 mt-1">
                    {activeSteps.map((item) => {
                      const isDone = completedSteps.has(
                        `${activePeriod}-${item.step}`,
                      );
                      const isPending = pendingSteps.has(
                        `${activePeriod}-${item.step}`,
                      );
                      return (
                        <Pressable
                          key={item.step}
                          onPress={() => handleToggleStep(activePeriod, item.step)}
                          disabled={isPending}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isDone }}
                          accessibilityLabel={`${item.product_type}, ${isDone ? "completed" : "not completed"}`}
                          className={`flex-col items-center gap-1.5 flex-1 active:opacity-70 ${
                            isPending ? "opacity-50" : ""
                          }`}
                        >
                          <View
                            className="h-11 w-11 rounded-full items-center justify-center bg-white"
                            style={
                              isDone
                                ? { backgroundColor: theme.colors.primary }
                                : { borderWidth: 1.5, borderColor: theme.colors.primary }
                            }
                          >
                            {isDone ? (
                              <Check size={16} color="white" />
                            ) : (
                              <View
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: theme.colors.primary }}
                              />
                            )}
                          </View>
                          <Text
                            className="text-[11px] text-center"
                            style={{ color: theme.colors.muted }}
                            numberOfLines={1}
                          >
                            {item.product_type}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </ClinicalCard>
          )}
        </FadeItem>

        {/* Quick AI Scan — dark gradient hero */}
        <FadeItem index={5}>
          <View className="mt-5">
            <SectionTitle title="Quick Actions" />
          </View>
        </FadeItem>
        <FadeItem index={6}>
          <GradientHeroCta
            icon={Camera}
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
        </FadeItem>

        {/* Chatbot & Progress quick actions */}
        <FadeItem index={7}>
          <View className="flex-row gap-3 mt-3">
            <Pressable
              className="flex-1 active:opacity-90"
              onPress={() => router.push("/(modules)/chatbot")}
            >
              <ClinicalCard className="items-center gap-2">
                <IconBadge icon={MessageSquare} size="lg" tone="soft" />
                <Text className="font-bold text-[13px] text-center" style={{ color: theme.colors.ink }}>
                  Chat
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
                  <Text className="font-bold text-[13px] text-center" style={{ color: theme.colors.ink }}>
                    Progress
                  </Text>
                  <Text className="text-[11px] text-center" style={{ color: theme.colors.muted }}>
                    Track your skin
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
                    <View className="h-12 w-12 rounded-2xl overflow-hidden" style={{ backgroundColor: theme.colors.primarySoft }}>
                      <Image
                        source={{ uri: result.image_url }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <IconBadge icon={Scan} size="md" tone="soft" />
                  )}
                  <View className="flex-col flex-1">
                    <Text className="text-sm font-semibold" style={{ color: theme.colors.ink }}>
                      {formatter(result.detection_label ?? result.severity)} — Score: {result.healthscore}%
                    </Text>
                    <Text
                            className="text-xs mt-0.5"
                            style={{ color: theme.colors.muted }}
                      numberOfLines={1}
                    >
                      {result.confidence
                        ? `Confidence: ${Math.round(result.confidence * 100)}%`
                        : formatter(result.severity)}
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
                    className="active:opacity-70"
                    onPress={() => router.push("/(modules)/progress")}
                  >
                    <ChevronRight size={18} color={theme.colors.faint} />
                  </Pressable>
                </View>
              ) : (
                <EmptyState
                  icon={Scan}
                  copy="No scans yet."
                />
              )}
            </ClinicalCard>
          )}
        </FadeItem>
      </ScrollView>
    </SafeAreaView>
  );
}
