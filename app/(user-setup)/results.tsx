import {
  View,
  Text,
  Pressable,
  ScrollView,
  ToastAndroid,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { formatter } from "@/utils/formatter";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { useState, useEffect } from "react";
import { updateUserProfile, getLatestResultDetail } from "@/lib/db";
import type { ResultData } from "@/types/schema";
import CircularProgress from "@/components/CircularProgress";
import Ionicons from "@react-native-vector-icons/ionicons";

export default function results() {
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [resultLoading, setResultLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const { healthScore, answers } = useLocalSearchParams<{
    healthScore: string;
    answers: string;
  }>();
  const score = Number(healthScore) || 0;
  const parsedAnswers: Record<string, string> = answers
    ? JSON.parse(answers)
    : {};
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
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 gap-5">
          <View className="pt-4 items-center">
            <Text className="font-bold text-green-700 text-2xl">
              Skin Results
            </Text>
            <Text className="text-gray-500">
              Your personalized skin analysis
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

          <View className="bg-white rounded-3xl shadow-sm py-4 px-4 gap-3">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-green-50">
                <Ionicons name="sparkles-outline" size={20} color="#15803D" />
              </View>
              <Text className="flex-1 text-base font-bold text-gray-900">
                Your routine is ready
              </Text>
            </View>
            <Text className="text-sm leading-5 text-gray-500">{message}</Text>
          </View>

          {resultLoading ? (
            <View className="bg-white rounded-3xl shadow-sm py-10 px-6 items-center gap-3">
              <ActivityIndicator color="#15803D" size="small" />
              <Text className="text-sm text-gray-500">
                Loading your recommended products...
              </Text>
            </View>
          ) : (
            resultData?.recommendations &&
            resultData.recommendations.length > 0 && (
              <View className="bg-white rounded-3xl shadow-sm py-4 px-4 gap-4">
                <Text className="font-bold text-gray-800 text-lg">
                  Recommended Products
                </Text>
                <Text className="text-sm text-gray-500 border-b border-gray-100 pb-3">
                  {resultData.description}
                </Text>
                {resultData.recommendations.map((product) => (
                  <View
                    key={product.product_type}
                    className="gap-1.5 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
                  >
                    <Text className="font-bold text-gray-900">
                      {product.product_type}
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
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
            )
          )}

          {Object.keys(parsedAnswers).length > 0 && (
            <View className="bg-white rounded-3xl shadow-sm py-4 px-4 gap-3">
              <Text className="font-bold text-gray-800 text-lg">
                Your Answers
              </Text>
              {Object.entries(parsedAnswers).map(([question, answer]) => (
                <View
                  key={question}
                  className="flex-row justify-between gap-3 border-b border-gray-100 pb-2 last:border-b-0 last:pb-0"
                >
                  <Text className="flex-1 text-sm text-gray-500">
                    {formatter(question)}
                  </Text>
                  <Text className="text-sm font-bold text-gray-900">
                    {formatter(answer)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View className="h-4" />
        </View>
      </ScrollView>
      <View className="py-6 w-full gap-2 px-6">
        <Pressable
          className={`rounded-full ${loading ? "bg-gray-400" : "bg-green-700"} active:opacity-80 p-4`}
          onPress={getStarted}
          disabled={loading}
        >
          <View className="flex-row items-center justify-center">
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="font-bold text-white">Confirm Result</Text>
            )}
          </View>
        </Pressable>
        <Pressable
          className="rounded-full border border-green-700 active:opacity-80 p-4"
          onPress={() => router.back()}
        >
          <View className="flex-row items-center justify-center gap-1">
            <Text className="text-center font-bold text-green-700">
              Retry Again
            </Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
