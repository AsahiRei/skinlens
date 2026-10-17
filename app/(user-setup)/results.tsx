import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check } from "lucide-react-native";

import CircularProgress from "@/components/CircularProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ClinicalCard, PrimaryButton, SecondaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import { getLatestResultDetail, updateUserProfile } from "@/lib/db";
import type { ResultData } from "@/types/schema";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { formatter } from "@/utils/formatter";
import { ScreenGradient } from "@/components/ScreenGradient";

export default function Results() {
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [resultLoading, setResultLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const { healthScore, answers } = useLocalSearchParams<{
    healthScore: string;
    answers: string;
  }>();
  const score = Number(healthScore) || 0;
  // answers comes from navigation params — never trust it blindly.
  const parsedAnswers: Record<string, string> = useMemo(() => {
    if (!answers) return {};
    try {
      const parsed: unknown = JSON.parse(answers);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      return {};
    } catch {
      return {};
    }
  }, [answers]);
  const { label, message, color, trackColor } = getHealthScoreResponse(
    score,
    parsedAnswers,
  );
  const router = useRouter();
  const getStarted = async () => {
    setLoading(true);
    try {
      await updateUserProfile({ user_setup: true });
      router.replace("/(tabs)");
    } catch {
      ToastAndroid.show(
        "Something went wrong. Please try again.",
        ToastAndroid.SHORT,
      );
    } finally {
      setLoading(false);
    }
  };
  const fetchResult = useCallback(async () => {
    setResultLoading(true);
    try {
      const data = await getLatestResultDetail();
      if (data) {
        setResultData(data);
      }
    } catch (error) {
      console.error("Result error:", error);
    } finally {
      setResultLoading(false);
    }
  }, []);
  // Mount fetch lives in its own cancelled-flag IIFE: the initial render
  // already shows the loading card (resultLoading starts true), so no
  // setState may run synchronously from the effect body.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getLatestResultDetail();
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
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-5 gap-5">
          <View className="pt-4 items-center">
            <Text className="font-bold text-[24px]" style={{ color: theme.colors.ink }}>
              Skin Results
            </Text>
            <Text style={{ color: theme.colors.muted }}>
              Your skin analysis
            </Text>
          </View>

          <View className="items-center gap-2">
            <CircularProgress
              progress={score}
              size={140}
              strokeWidth={8}
              color={color}
              trackColor={trackColor}
            >
              <Text className="text-3xl font-semibold text-gray-700">
                {score}%
              </Text>
            </CircularProgress>
            <View className="flex-row items-center gap-1.5">
              <View
                style={{ backgroundColor: color }}
                className="h-2 w-2 rounded-full"
              />
              <Text className="text-sm font-medium text-gray-500">{label}</Text>
            </View>
          </View>

          <ClinicalCard className="gap-3">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: theme.colors.primarySoft }}>
                <Check size={20} color={theme.colors.primary} />
              </View>
              <Text className="flex-1 text-base font-bold" style={{ color: theme.colors.ink }}>
                Your routine is ready
              </Text>
            </View>
            <Text className="text-sm leading-5" style={{ color: theme.colors.body }}>{message}</Text>
          </ClinicalCard>

          {resultLoading ? (
            <ClinicalCard className="items-center gap-3" style={{ paddingVertical: 40, paddingHorizontal: 24 }}>
              <ActivityIndicator color={theme.colors.primary} size="small" />
              <Text className="text-sm" style={{ color: theme.colors.muted }}>
                Loading your recommended products...
              </Text>
            </ClinicalCard>
          ) : (
            resultData?.recommendations &&
            resultData.recommendations.length > 0 && (
              <ClinicalCard className="gap-4">
                <Text className="font-bold text-[16px]" style={{ color: theme.colors.ink }}>
                  Recommended Products
                </Text>
                <Text className="text-sm pb-3" style={{ color: theme.colors.muted, borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}>
                  {resultData.description}
                </Text>
                {resultData.recommendations.map((product) => (
                  <View
                    key={product.product_type}
                    className="gap-1.5 pb-3"
                    style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}
                  >
                    <Text className="font-bold" style={{ color: theme.colors.ink }}>
                      {product.product_type}
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {product.recommended_ingredients.map((ingredient, i) => (
                        <View
                          key={i}
                          className="rounded-full px-3 py-1"
                          style={{ backgroundColor: theme.colors.primarySoft }}
                        >
                          <Text className="text-xs font-semibold" style={{ color: theme.colors.primaryDeep }}>
                            {ingredient}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text className="text-xs mt-1" style={{ color: theme.colors.faint }}>
                      {product.reason}
                    </Text>
                  </View>
                ))}
              </ClinicalCard>
            )
          )}

          {Object.keys(parsedAnswers).length > 0 && (
            <ClinicalCard className="gap-3">
              <Text className="font-bold text-[16px]" style={{ color: theme.colors.ink }}>
                Your Answers
              </Text>
              {Object.entries(parsedAnswers).map(([question, answer]) => (
                <View
                  key={question}
                  className="flex-row justify-between gap-3 pb-2"
                  style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}
                >
                  <Text className="flex-1 text-sm" style={{ color: theme.colors.muted }}>
                    {formatter(question)}
                  </Text>
                  <Text className="text-sm font-bold" style={{ color: theme.colors.ink }}>
                    {formatter(answer)}
                  </Text>
                </View>
              ))}
            </ClinicalCard>
          )}

          <View className="h-4" />
        </View>
      </ScrollView>
      <View className="py-6 w-full gap-2 px-5">
        <PrimaryButton
          label="Confirm Result"
          onPress={getStarted}
          loading={loading}
        />
        <SecondaryButton label="Retry Again" onPress={fetchResult} />
      </View>
    </SafeAreaView>
  );
}
