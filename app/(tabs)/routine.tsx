import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import InlineProgress from "@/components/InlineProgress";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  getLatestRoutine,
  getTodayProgress,
  toggleStep as toggleStepDb,
} from "@/lib/db";
import type { Period, Routine, RoutineStep } from "@/types/schema";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const PERIOD_CONFIG: Record<
  Period,
  { label: string; icon: IconName; key: keyof Routine }
> = {
  morning: { label: "Morning", icon: "sunny", key: "morning_routine" },
  afternoon: {
    label: "Afternoon",
    icon: "partly-sunny",
    key: "afternoon_routine",
  },
  evening: { label: "Evening", icon: "moon", key: "evening_routine" },
};

export default function Routines() {
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [routineId, setRoutineId] = useState<number | null>(null);
  const [loadingRoutine, setLoadingRoutine] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [activePeriod, setActivePeriod] = useState<Period>("morning");
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [pendingSteps, setPendingSteps] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
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
    fetchRoutine();
  }, []);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchRoutine();
    } finally {
      setRefreshing(false);
    }
  };
  const activeSteps = routine
    ? (routine[PERIOD_CONFIG[activePeriod].key] as RoutineStep[])
    : [];
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
  const doneCount = completedSteps.size;
  const progressPct =
    totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;
  const handleToggleStep = async (period: Period, step: number) => {
    const key = `${period}-${step}`;
    // Ignore taps while a write for this step is already in flight
    if (pendingSteps.has(key)) return;
    const isCurrentlyDone = completedSteps.has(key);
    // Optimistic UI update
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
      // Revert optimistic update on failure
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
    <SafeAreaView className="flex-1 bg-gray-50">
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
        <Text className="font-bold text-green-700 text-2xl">My Routine</Text>
        <Text className="text-gray-500">AI Personalized Routine Generator</Text>
        <View className="flex-row items-center gap-2 mt-5">
          {(Object.keys(PERIOD_CONFIG) as Period[]).map((period) => {
            const { label, icon } = PERIOD_CONFIG[period];
            const isActive = activePeriod === period;
            return (
              <Pressable
                key={period}
                onPress={() => setActivePeriod(period)}
                className={`flex-1 rounded-full py-3 flex-row justify-center items-center gap-1.5 border ${
                  isActive
                    ? "bg-green-700 border-green-700"
                    : "border-green-700"
                }`}
              >
                <Ionicons
                  name={icon}
                  size={14}
                  color={isActive ? "#FFFFFF" : "#15803D"}
                />
                <Text
                  className={`text-center font-bold text-sm ${
                    isActive ? "text-white" : "text-green-700"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Progress */}
        {!loadingRoutine && routine && totalSteps > 0 && (
          <View className="mt-5 gap-2">
            <View className="flex-row justify-between items-center">
              <Text className="font-bold text-gray-800">
                {doneCount}/{totalSteps} completed
              </Text>
              <Text className="text-xs text-gray-500">{progressPct}%</Text>
            </View>
            <InlineProgress progress={progressPct} height={8} color="#15803D" />
          </View>
        )}

        {/* Steps */}
        <View className="flex-col gap-3 mt-5">
          {loadingRoutine ? (
            <>
              <Skeleton className="h-24 w-full rounded-3xl" />
              <Skeleton className="h-24 w-full rounded-3xl" />
              <Skeleton className="h-24 w-full rounded-3xl" />
            </>
          ) : loadError ? (
            <View className="bg-white rounded-3xl py-10 px-6 items-center gap-2">
              <Ionicons name="alert-circle-outline" size={28} color="#B91C1C" />
              <Text className="font-bold text-gray-800">
                Couldn't load your routine
              </Text>
              <Text className="text-sm text-gray-500 text-center">
                Check your connection and try again.
              </Text>
            </View>
          ) : !routine ? (
            <View className="bg-white rounded-3xl py-10 px-6 items-center gap-2">
              <Ionicons name="sparkles-outline" size={28} color="#15803D" />
              <Text className="font-bold text-gray-800">No routine yet</Text>
              <Text className="text-sm text-gray-500 text-center">
                Generate a personalized routine to see your steps here.
              </Text>
            </View>
          ) : activeSteps.length === 0 ? (
            <View className="bg-white rounded-3xl py-10 px-6 items-center gap-2">
              <Ionicons
                name={PERIOD_CONFIG[activePeriod].icon}
                size={28}
                color="#15803D"
              />
              <Text className="text-sm text-gray-500 text-center">
                No {PERIOD_CONFIG[activePeriod].label.toLowerCase()} steps in
                this routine.
              </Text>
            </View>
          ) : (
            activeSteps.map((item) => {
              const key = `${activePeriod}-${item.step}`;
              const isDone = completedSteps.has(key);
              const isPending = pendingSteps.has(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => handleToggleStep(activePeriod, item.step)}
                  disabled={isPending}
                  className={`bg-white rounded-3xl shadow-sm py-4 px-4 flex-row items-start gap-3 ${
                    isDone ? "opacity-60" : ""
                  } ${isPending ? "opacity-40" : ""}`}
                >
                  <View
                    className={`h-8 w-8 rounded-full items-center justify-center mt-0.5 ${
                      isDone ? "bg-green-700" : "bg-green-100"
                    }`}
                  >
                    {isDone ? (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    ) : (
                      <Text className="text-green-700 font-bold">
                        {item.step}
                      </Text>
                    )}
                  </View>
                  <View className="flex-col flex-1 gap-1">
                    <Text
                      className={`font-bold text-gray-900 ${
                        isDone ? "line-through" : ""
                      }`}
                    >
                      {item.product_type}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {item.instruction}
                    </Text>
                    <Text className="text-xs text-gray-400">{item.reason}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        {/* Recommended products */}
        {!loadingRoutine &&
          routine &&
          routine.recommended_products?.length > 0 && (
            <View className="mt-8 gap-3">
              <Text className="font-bold text-gray-800 text-lg">
                Recommended Products
              </Text>
              {routine.recommended_products.map((product, index) => (
                <View
                  key={index}
                  className="bg-white rounded-3xl shadow-sm py-4 px-4 gap-1.5"
                >
                  <Text className="font-bold text-gray-900">
                    {product.product_type}
                  </Text>
                  <View className="flex-row flex-wrap gap-1.5 mt-1">
                    {product.recommended_ingredients.map((ingredient, i) => (
                      <View
                        key={i}
                        className="bg-green-50 rounded-full px-3 py-1"
                      >
                        <Text className="text-xs text-green-700 font-medium">
                          {ingredient}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text className="text-xs text-gray-400 mt-1">
                    {product.reason}
                  </Text>
                </View>
              ))}
            </View>
          )}
      </ScrollView>
    </SafeAreaView>
  );
}
