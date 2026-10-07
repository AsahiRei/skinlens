import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check } from "lucide-react-native";

import CircularProgress from "@/components/CircularProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { PrimaryButton } from "@/components/ui";
import { cardShadow, theme } from "@/lib/theme";
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
  useEffect(() => {
    const fetchResult = async () => {
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
    };
    fetchResult();
  }, []);
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-5 gap-5">
          <View className="pt-4 items-center">
            <Text className="font-bold text-[24px]" style={{ color: "#10241A" }}>
              Skin Results
            </Text>
            <Text style={{ color: "#6B7280" }}>
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

          <View className="bg-white rounded-[20px] py-4 px-4 gap-3" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "#EAF6EE" }}>
                <Check size={20} color="#15803D" />
              </View>
              <Text className="flex-1 text-base font-bold" style={{ color: "#10241A" }}>
                Your routine is ready
              </Text>
            </View>
            <Text className="text-sm leading-5" style={{ color: "#3F4A44" }}>{message}</Text>
          </View>

          {resultLoading ? (
            <View className="bg-white rounded-[20px] py-10 px-6 items-center gap-3" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
              <ActivityIndicator color="#15803D" size="small" />
              <Text className="text-sm" style={{ color: "#6B7280" }}>
                Loading your recommended products...
              </Text>
            </View>
          ) : (
            resultData?.recommendations &&
            resultData.recommendations.length > 0 && (
              <View className="bg-white rounded-[20px] py-4 px-4 gap-4" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
                <Text className="font-bold text-[16px]" style={{ color: "#10241A" }}>
                  Recommended Products
                </Text>
                <Text className="text-sm pb-3" style={{ color: "#6B7280", borderBottomWidth: 1, borderBottomColor: "#EEF2EF" }}>
                  {resultData.description}
                </Text>
                {resultData.recommendations.map((product) => (
                  <View
                    key={product.product_type}
                    className="gap-1.5 pb-3"
                    style={{ borderBottomWidth: 1, borderBottomColor: "#EEF2EF" }}
                  >
                    <Text className="font-bold" style={{ color: "#10241A" }}>
                      {product.product_type}
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {product.recommended_ingredients.map((ingredient, i) => (
                        <View
                          key={i}
                          className="rounded-full px-3 py-1"
                          style={{ backgroundColor: "#EAF6EE" }}
                        >
                          <Text className="text-xs font-semibold" style={{ color: "#14532D" }}>
                            {ingredient}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                      {product.reason}
                    </Text>
                  </View>
                ))}
              </View>
            )
          )}

          {Object.keys(parsedAnswers).length > 0 && (
            <View className="bg-white rounded-[20px] py-4 px-4 gap-3" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
              <Text className="font-bold text-[16px]" style={{ color: "#10241A" }}>
                Your Answers
              </Text>
              {Object.entries(parsedAnswers).map(([question, answer]) => (
                <View
                  key={question}
                  className="flex-row justify-between gap-3 pb-2"
                  style={{ borderBottomWidth: 1, borderBottomColor: "#EEF2EF" }}
                >
                  <Text className="flex-1 text-sm" style={{ color: "#6B7280" }}>
                    {formatter(question)}
                  </Text>
                  <Text className="text-sm font-bold" style={{ color: "#10241A" }}>
                    {formatter(answer)}
                  </Text>
                </View>
              ))}
            </View>
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
        <Pressable
          className="rounded-full bg-white active:opacity-80 p-4"
          style={{ borderWidth: 1.5, borderColor: theme.colors.primary }}
          onPress={() => router.back()}
        >
          <View className="flex-row items-center justify-center gap-1">
            <Text className="text-center font-bold" style={{ color: theme.colors.primary }}>
              Retry Again
            </Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
