import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, Info } from "lucide-react-native";

import CircularProgress from "@/components/CircularProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ClinicalCard, Notice, PrimaryButton, SecondaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import Animated from "react-native-reanimated";
import { enterUp, fadeIn, listLayout, popIn } from "@/components/motion";
import { getLatestResult, requireUser, updateUserProfile } from "@/lib/db";
import { useTutorial } from "@/components/TutorialCoach";
import { setTutorialPending } from "@/lib/tutorial";
import type { Result } from "@/types/schema";
import { getHealthScoreResponse } from "@/utils/healthscore";
import {
  computeSetupScore,
  describeSetupAnswers,
  getSetupProfileResponse,
  sanitizeSetupAnswers,
  setupDisclaimer,
} from "@/utils/setup-score";
import { ScreenGradient } from "@/components/ScreenGradient";
import { RecommendedProductBody } from "@/components/RecommendedProduct";

export default function Results() {
  const [resultData, setResultData] = useState<Result | null>(null);
  const [resultLoading, setResultLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const { answers } = useLocalSearchParams<{ answers: string }>();
  // answers comes from navigation params — never trust it blindly.
  const parsedAnswers: Record<string, string> = useMemo(() => {
    if (!answers) return {};
    try {
      return sanitizeSetupAnswers(JSON.parse(answers));
    } catch {
      return {};
    }
  }, [answers]);
  // The saved baseline row is the source of truth (it includes the photo grade when the photo was
  // clear enough). Params are never trusted for the score; answers-only is the fallback if the row
  // can't be read.
  const photoLabel = resultData?.detection_label?.trim() || null;
  const score = resultData ? Math.round(resultData.healthscore) : computeSetupScore(parsedAnswers);
  // Colors still come from the shared bands; the words are setup-specific guidance.
  const { color, trackColor } = getHealthScoreResponse(score, parsedAnswers);
  const { label, message } = getSetupProfileResponse(score, parsedAnswers, photoLabel);
  const answerRows = useMemo(() => describeSetupAnswers(parsedAnswers), [parsedAnswers]);
  const router = useRouter();
  const { startTutorial } = useTutorial();
  const getStarted = async () => {
    setLoading(true);
    try {
      await updateUserProfile({ user_setup: true });
      // Arm the first-run tour flag: the boot router reads it, so killing the app mid-tour replays
      // the tour on the next launch instead of silently dropping it.
      try {
        const user = await requireUser();
        await setTutorialPending(user.id);
      } catch (err) {
        console.warn("[results] tutorial flag not armed:", err);
      }
      // Walk the user through the real app: the coach tour opens on Home
      // and moves through every tab as it explains each feature.
      startTutorial();
      router.replace("/(tabs)");
    } catch {
      ToastAndroid.show("Something went wrong. Please try again.", ToastAndroid.SHORT);
    } finally {
      setLoading(false);
    }
  };
  const fetchResult = useCallback(async () => {
    setResultLoading(true);
    try {
      const data = await getLatestResult();
      if (data) {
        setResultData(data);
      }
    } catch (error) {
      console.error("Result error:", error);
    } finally {
      setResultLoading(false);
    }
  }, []);
  // Mount fetch lives in its own cancelled-flag IIFE: the initial render already shows the loading
  // card (resultLoading starts true), so no setState may run synchronously from the effect body.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getLatestResult();
        if (!cancelled && data) setResultData(data);
      } catch (error) {
        console.error("Result error:", error);
      } finally {
        if (!cancelled) setResultLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 px-5 gap-5">
          <Animated.View entering={enterUp(0)} className="pt-4 items-center">
            <Text className="font-bold text-[24px]" style={{ color: theme.colors.ink }}>
              Your Skin Profile
            </Text>
            <Text style={{ color: theme.colors.muted }}>
              {photoLabel
                ? "A starting point from your photo and answers"
                : "A starting point based on your answers"}
            </Text>
          </Animated.View>

          {resultLoading ? (
            <View className="items-center justify-center" style={{ height: 190 }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <Animated.View entering={enterUp(1)} className="items-center gap-2">
              <CircularProgress
                progress={score}
                size={140}
                strokeWidth={8}
                color={color}
                trackColor={trackColor}
              >
                <Text className="text-3xl font-semibold text-gray-700">{score}/100</Text>
              </CircularProgress>
              <View className="flex-row items-center gap-1.5">
                <View style={{ backgroundColor: color }} className="h-2 w-2 rounded-full" />
                <Text className="text-sm font-medium text-gray-500">{label}</Text>
              </View>
              <Text className="text-xs" style={{ color: theme.colors.faint }}>
                {photoLabel ? "Photo 60% · Answers 40%" : "Based on your answers only"}
              </Text>
            </Animated.View>
          )}

          <Animated.View entering={enterUp(2)}>
            <ClinicalCard className="gap-3">
              <View className="flex-row items-center gap-3">
                <View
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.colors.primarySoft }}
                >
                  <Animated.View entering={popIn.delay(450)}>
                    <Check size={20} color={theme.colors.primary} />
                  </Animated.View>
                </View>
                <Text className="flex-1 text-base font-bold" style={{ color: theme.colors.ink }}>
                  Your routine is ready
                </Text>
              </View>
              <Text className="text-sm leading-5" style={{ color: theme.colors.body }}>
                {message}
              </Text>
            </ClinicalCard>
          </Animated.View>

          {resultLoading ? (
            <Animated.View key="loading" entering={enterUp(3)}>
              <ClinicalCard
                className="items-center gap-3"
                style={{ paddingVertical: 40, paddingHorizontal: 24 }}
              >
                <ActivityIndicator color={theme.colors.primary} size="small" />
                <Text className="text-sm" style={{ color: theme.colors.muted }}>
                  Loading your recommended products...
                </Text>
              </ClinicalCard>
            </Animated.View>
          ) : (
            resultData?.recommendations &&
            resultData.recommendations.length > 0 && (
              <Animated.View key="products" entering={fadeIn} layout={listLayout}>
                <ClinicalCard className="gap-4">
                  <Text className="font-bold text-[16px]" style={{ color: theme.colors.ink }}>
                    Commonly Recommended Products
                  </Text>
                  <Text
                    className="text-sm pb-3"
                    style={{
                      color: theme.colors.muted,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.divider,
                    }}
                  >
                    {resultData.description}
                  </Text>
                  {resultData.recommendations.map((product) => (
                    <View
                      key={product.product_type}
                      className="gap-1.5 pb-3"
                      style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}
                    >
                      <RecommendedProductBody product={product} />
                    </View>
                  ))}
                </ClinicalCard>
              </Animated.View>
            )
          )}

          {answerRows.length > 0 && (
            <Animated.View entering={enterUp(4)} layout={listLayout}>
              <ClinicalCard className="gap-3">
                <Text className="font-bold text-[16px]" style={{ color: theme.colors.ink }}>
                  Your Answers
                </Text>
                {answerRows.map((row) => (
                  <View
                    key={row.label}
                    className="flex-row justify-between gap-3 pb-2"
                    style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}
                  >
                    <Text className="flex-1 text-sm" style={{ color: theme.colors.muted }}>
                      {row.label}
                    </Text>
                    <Text
                      className="flex-1 text-sm font-bold text-right"
                      style={{ color: theme.colors.ink }}
                    >
                      {row.value}
                    </Text>
                  </View>
                ))}
              </ClinicalCard>
            </Animated.View>
          )}

          <Animated.View entering={enterUp(5)} layout={listLayout}>
            <Notice icon={Info} tone="info" copy={setupDisclaimer(!!photoLabel)} />
          </Animated.View>

          <View className="h-4" />
        </View>
      </ScrollView>
      <View className="py-6 w-full gap-2 px-5">
        <PrimaryButton label="Continue" onPress={getStarted} loading={loading} />
        {/* Only offer a reload when the recommendations actually failed to load. */}
        {!resultLoading && !resultData && (
          <SecondaryButton label="Reload Recommendations" onPress={fetchResult} />
        )}
      </View>
    </SafeAreaView>
  );
}
