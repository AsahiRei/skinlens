import type React from "react";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Bell,
  Sun,
  CloudSun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  Camera,
  ArrowRight,
  MessageSquare,
  TrendingUp,
  Scan,
} from "lucide-react-native";

import CircularProgress from "@/components/CircularProgress";
import FadeInView from "@/components/FadeInView";
import InlineProgress from "@/components/InlineProgress";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useFocusTrigger } from "@/hooks";
import {
  getLatestResult,
  getLatestRoutine,
  getSkinProfile,
  getTodayProgress,
  getUserProfile,
  toggleStep as toggleStepDb,
} from "@/lib/db";
import type { Period, Routine, RoutineStep, Result, SkinProfile, UserProfile } from "@/types/schema";
import { formatter } from "@/utils/formatter";

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
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [skinProfile, setSkinProfile] = useState<SkinProfile | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingSkin, setLoadingSkin] = useState(true);
  const [loadingResult, setLoadingResult] = useState(true);
  const [hasNotifications, setHasNotifications] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [routineId, setRoutineId] = useState<number | null>(null);
  // Keys are "period-step", e.g. "morning-1", so progress across all
  // three periods can live in one Set.
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [loadingRoutine, setLoadingRoutine] = useState(true);
  const [activePeriod, setActivePeriod] = useState<Period>("morning");

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Good morning ☀️";
    } else if (hour < 18) {
      return "Good afternoon 🌤️";
    } else {
      return "Good evening 🌙";
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
    } finally {
      setLoadingSkin(false);
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
      fetchSkinProfile(),
      fetchResult(),
      fetchRoutine(),
    ]);
  };

  useEffect(() => {
    loadAll();
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
    const isCurrentlyDone = completedSteps.has(key);

    // Optimistic UI update
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (isCurrentlyDone) next.delete(key);
      else next.add(key);
      return next;
    });

    try {
      if (routineId == null) throw new Error("Missing routine");
      await toggleStepDb(routineId, period, step, isCurrentlyDone);
    } catch (err) {
      console.error("Error toggling step:", err);
      // Revert optimistic update on failure
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        if (isCurrentlyDone) next.add(key);
        else next.delete(key);
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

  const goToPeriod = (direction: -1 | 1) => {
    const currentIndex = PERIOD_ORDER.indexOf(activePeriod);
    const nextIndex =
      (currentIndex + direction + PERIOD_ORDER.length) % PERIOD_ORDER.length;
    setActivePeriod(PERIOD_ORDER[nextIndex]);
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#15803D"
            colors={["#15803D"]}
          />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <View className="flex-col">
            <Text className="font-semibold text-gray-500 text-base tracking-wide">
              {getGreeting()}
            </Text>
            {loadingUser ? (
              <Skeleton className="h-7 w-40 mt-1" />
            ) : (
              <Text className="font-bold text-green-700 text-2xl mt-0.5">
                {userProfile?.username}
              </Text>
            )}
          </View>
          <Pressable className="h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm active:opacity-80">
            <Bell size={20} color="#15803D" />
            {hasNotifications && (
              <View className="absolute top-2 right-2.5 h-2.5 w-2.5 rounded-full bg-red-500 border border-white" />
            )}
          </Pressable>
        </View>

        {/* Skin health score */}
        <FadeInView delay={100} triggerKey={focusTrigger}>
          <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 flex-row items-center gap-4 mt-5">
            <CircularProgress
              progress={Number(result?.healthscore ?? 0)}
              size={68}
              strokeWidth={6}
              color="#15803D"
              trackColor="#DCFCE7"
            >
              <Text className="text-lg font-bold text-green-700">
                {result?.healthscore ?? 0}%
              </Text>
            </CircularProgress>
            <View className="flex-col flex-1">
              <Text className="font-bold text-gray-900 text-[15px]">
                Skin Health Score
              </Text>
              {loadingResult ? (
                <Skeleton className="w-28 h-4 mt-1" />
              ) : (
                <Text className="text-xs text-gray-500 mt-0.5">
                  {formatter(result?.severity ?? "—")} Progress
                </Text>
              )}
              <Pressable className="bg-green-700 rounded-full self-start px-4 py-1.5 mt-2.5 active:opacity-80">
                <Text className="text-xs text-white font-bold">
                  View Progress
                </Text>
              </Pressable>
            </View>
          </View>
        </FadeInView>

        {/* Routine (paginated: morning / afternoon / evening) */}
        <FadeInView delay={200} triggerKey={focusTrigger}>
          <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 mt-4 flex-col gap-3">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => goToPeriod(-1)}
              hitSlop={8}
              className="h-8 w-8 items-center justify-center rounded-full bg-gray-50 active:opacity-70"
            >
              <ChevronLeft size={16} color="#15803D" />
            </Pressable>

            <View className="flex-row items-center gap-2">
              {(() => {
                const Icon = PERIOD_CONFIG[activePeriod].icon;
                return <Icon size={18} color="#15803D" />;
              })()}
              <Text className="font-bold text-gray-900 text-[15px]">
                {PERIOD_CONFIG[activePeriod].label}
              </Text>
            </View>

            <Pressable
              onPress={() => goToPeriod(1)}
              hitSlop={8}
              className="h-8 w-8 items-center justify-center rounded-full bg-gray-50 active:opacity-70"
            >
              <ChevronRight size={16} color="#15803D" />
            </Pressable>
          </View>

          {/* Dot indicators for which period is active */}
          <View className="flex-row items-center justify-center gap-1.5">
            {PERIOD_ORDER.map((period) => (
              <View
                key={period}
                className={`h-1.5 rounded-full ${
                  period === activePeriod
                    ? "w-4 bg-green-700"
                    : "w-1.5 bg-green-100"
                }`}
              />
            ))}
          </View>

          {!loadingRoutine && totalCount > 0 && (
            <View className="self-center py-1 px-3 bg-green-50 rounded-full">
              <Text className="text-xs font-bold text-green-700">
                {completedCount} / {totalCount} done
              </Text>
            </View>
          )}

          {loadingRoutine ? (
            <Skeleton className="h-16 w-full rounded-2xl" />
          ) : totalCount === 0 ? (
            <View className="items-center py-4">
              <Sparkles size={22} color="#D1D5DB" />
              <Text className="text-xs text-gray-400 mt-2 text-center">
                No {PERIOD_CONFIG[activePeriod].label.toLowerCase()} yet.
                Generate a routine to see it here.
              </Text>
            </View>
          ) : (
            <>
              <InlineProgress
                progress={routineProgress}
                height={8}
                color="#15803D"
              />

              <View className="flex-row items-start justify-between gap-2 mt-1">
                {activeSteps.map((item) => {
                  const isDone = completedSteps.has(
                    `${activePeriod}-${item.step}`,
                  );
                  return (
                    <Pressable
                      key={item.step}
                      onPress={() => handleToggleStep(activePeriod, item.step)}
                      className="flex-col items-center gap-1.5 flex-1 active:opacity-70"
                    >
                      <View
                        className={`h-10 w-10 rounded-full items-center justify-center ${
                          isDone ? "bg-green-700" : "bg-green-50"
                        }`}
                      >
                        {isDone ? (
                          <Check size={16} color="white" />
                        ) : (
                          <View className="h-2.5 w-2.5 rounded-full bg-green-700/40" />
                        )}
                      </View>
                      <Text
                        className="text-[11px] text-gray-500 text-center"
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
        </View>
        </FadeInView>
        <FadeInView delay={300} triggerKey={focusTrigger}>
          <Pressable className="bg-white rounded-xl border border-gray-100 py-4 px-4 mt-4 flex-row items-center justify-between active:opacity-90">
          <View className="flex-row items-center gap-3 flex-1">
            <View className="bg-green-100 h-12 w-12 items-center justify-center rounded-2xl">
              <Camera size={22} color="#15803D" />
            </View>
            <View className="flex-col flex-1">
              <Text className="font-bold text-gray-900 text-[15px]">
                Quick AI Scan
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                Analyze your skin within 30 seconds
              </Text>
            </View>
          </View>
          <View className="bg-green-100 h-9 w-9 items-center justify-center rounded-full">
            <ArrowRight size={16} color="#15803D" />
          </View>
          </Pressable>
        </FadeInView>

        {/* Chatbot & Progress quick actions */}
        <FadeInView delay={400} triggerKey={focusTrigger}>
          <View className="flex-row gap-3 mt-4">
          <Pressable
            className="bg-white rounded-xl border border-gray-100 py-4 px-4 flex-1 items-center gap-2 active:opacity-90"
            onPress={() => router.push("/(modules)/chatbot")}
          >
            <View className="bg-green-100 h-12 w-12 items-center justify-center rounded-2xl">
              <MessageSquare
                size={22}
                color="#15803D"
              />
            </View>
            <Text className="font-bold text-gray-900 text-[13px] text-center">
              AI Chatbot
            </Text>
            <Text className="text-[11px] text-gray-500 text-center">
              Ask skin questions
            </Text>
          </Pressable>

          <Pressable className="bg-white rounded-xl border border-gray-100 py-4 px-4 flex-1 items-center gap-2 active:opacity-90">
            <View className="bg-green-100 h-12 w-12 items-center justify-center rounded-2xl">
              <TrendingUp size={22} color="#15803D" />
            </View>
            <Text className="font-bold text-gray-900 text-[13px] text-center">
              Progress
            </Text>
            <Text className="text-[11px] text-gray-500 text-center">
              Track your skin
            </Text>
          </Pressable>
        </View>
        </FadeInView>

        {/* Last scan result */}
        <FadeInView delay={500} triggerKey={focusTrigger}>
        <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 mt-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-bold text-gray-900 text-[15px]">
              Last Scan Result
            </Text>
            <Text className="text-xs text-gray-400">
              {userProfile?.created_at
                ? new Date(userProfile.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "No scans yet"}
            </Text>
          </View>

          {skinProfile ? (
            <View className="flex-row items-center gap-3 mt-3 pt-3 border-t border-gray-100">
              <View className="bg-green-50 h-11 w-11 items-center justify-center rounded-2xl">
                <Sparkles size={20} color="#15803D" />
              </View>
              <View className="flex-col flex-1">
                <Text className="text-sm font-semibold text-gray-800">
                  {skinProfile.skin_type ?? "Unknown"} skin
                </Text>
                <Text
                  className="text-xs text-gray-500 mt-0.5"
                  numberOfLines={1}
                >
                  Main concern: {skinProfile.main_concerns ?? "—"}
                </Text>
              </View>
              <Pressable className="active:opacity-70">
                <ChevronRight size={18} color="#9CA3AF" />
              </Pressable>
            </View>
          ) : (
            <View className="items-center py-6">
              <Scan size={28} color="#D1D5DB" />
              <Text className="text-xs text-gray-400 mt-2">
                Run your first scan to see results here
              </Text>
            </View>
          )}
        </View>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  );
}
