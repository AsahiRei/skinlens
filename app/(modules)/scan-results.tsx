import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";

import CircularProgress from "@/components/CircularProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { getLatestResultDetail, insertResult, insertRoutine } from "@/lib/db";
import type { ResultData } from "@/types/schema";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { generateRoutine, preloadLlama } from "@/utils/routine-generator";

const detectionDescriptions: Record<string, string> = {
  acne: "Our AI detected signs of acne on your skin. Acne is a common skin condition caused by clogged pores, excess oil, and bacteria. With the right routine, it can be managed effectively.",
  eczema:
    "Our AI detected signs of eczema on your skin. Eczema is a condition that causes dry, itchy, and inflamed patches of skin. A gentle skincare routine can help manage flare-ups.",
  psoriasis:
    "Our AI detected signs of psoriasis on your skin. Psoriasis causes rapid skin cell buildup, resulting in scaling on the skin's surface. Consistent care can help reduce flare-ups.",
  normal:
    "No significant skin conditions were detected. Your skin appears healthy. A good maintenance routine will help keep it that way.",
};

const detectionSeverityMap: Record<string, number> = {
  normal: 85,
  acne: 55,
  eczema: 40,
  psoriasis: 35,
};

export default function ScanResults() {
  const router = useRouter();
  const {
    imageUri,
    sourceType,
    label,
    confidence,
    surveyAnswers,
    severityScore,
  } = useLocalSearchParams<{
    imageUri: string;
    sourceType: string;
    label: string;
    confidence: string;
    surveyAnswers: string;
    severityScore: string;
  }>();

  const detectionLabel = label ?? "normal";
  const surveyScore = Number(severityScore) || 50;
  const conf = Number(confidence) || 0;
  const parsedSurveyAnswers: Record<string, string> = surveyAnswers
    ? JSON.parse(surveyAnswers)
    : {};

  // Calculate overall health score: blend detection baseline with survey severity
  const detectionBaseline = detectionSeverityMap[detectionLabel] ?? 50;
  const overallScore = Math.round(detectionBaseline * 0.6 + surveyScore * 0.4);

  const {
    label: severityLabel,
    message,
    color,
    trackColor,
  } = getHealthScoreResponse(overallScore, {
    skin_type: "normal",
    main_concern: detectionLabel,
  });

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(true);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [routineGenerated, setRoutineGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);
  const downloadToastShown = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    generateAndSave();
  }, []);

  const generateAndSave = async () => {
    try {
      setGenerating(true);
      setError(null);
      await preloadLlama((fraction) => {
        if (fraction < 0.1 && !downloadToastShown.current) {
          downloadToastShown.current = true;
          ToastAndroid.show(
            "AI model is downloading. This may take a moment...",
            ToastAndroid.LONG,
          );
        }
      });
      const routineJson = await generateRoutine({
        skin_type: "normal",
        main_concern: detectionLabel,
        sleep_quality: parsedSurveyAnswers.duration ?? "fair",
        stress_level: parsedSurveyAnswers.severity ?? "moderate",
        water_intake: parsedSurveyAnswers.area ?? "1_to_1_5l",
        health_score: overallScore,
      });
      await insertRoutine(routineJson);
      const healthResponse = getHealthScoreResponse(overallScore, {
        skin_type: "normal",
        main_concern: detectionLabel,
      });
      const parsedRoutine = JSON.parse(routineJson);
      await insertResult({
        severity: healthResponse.severity,
        description: healthResponse.message,
        healthscore: overallScore,
        recommendations: parsedRoutine.recommended_products ?? null,
        image_url: imageUri ?? null,
        source_type: `scan_${sourceType ?? "gallery"}`,
      });
      const latestResult = await getLatestResultDetail();
      if (latestResult) setResultData(latestResult);
      setRoutineGenerated(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to generate your routine. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
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

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 px-6 items-center justify-center">
          <View className="bg-white rounded-3xl shadow-sm py-10 px-6 items-center gap-2 w-full">
            <Ionicons name="alert-circle-outline" size={28} color="#B91C1C" />
            <Text className="font-bold text-gray-800">
              Couldn't generate results
            </Text>
            <Text className="text-sm text-gray-500 text-center">{error}</Text>
            <Pressable
              className="rounded-full bg-green-700 active:opacity-80 px-6 py-3 mt-2"
              onPress={() => {
                ranRef.current = false;
                generateAndSave();
              }}
            >
              <Text className="font-bold text-white">Try Again</Text>
            </Pressable>
            <Pressable
              className="rounded-full border border-green-700 active:opacity-80 px-6 py-3 mt-1"
              onPress={() => router.back()}
            >
              <Text className="font-bold text-green-700">Go Back</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 gap-5">
          <View className="pt-4 items-center">
            <Text className="font-bold text-green-700 text-2xl">
              Scan Results
            </Text>
            <Text className="text-gray-500">Your AI-powered skin analysis</Text>
          </View>

          {/* Scanned image */}
          {imageUri && (
            <View className="items-center">
              <View className="w-40 h-40 rounded-3xl overflow-hidden bg-gray-200 shadow-sm">
                <Image
                  source={{ uri: imageUri }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              </View>
            </View>
          )}

          {/* Detection class & confidence */}
          <View className="items-center gap-2">
            <Text className="text-xl font-bold text-gray-800 capitalize">
              {detectionLabel}
            </Text>
            {conf > 0 && (
              <Text className="text-sm text-gray-500">
                Confidence: {(conf * 100).toFixed(1)}%
              </Text>
            )}
          </View>

          {/* Health score */}
          <View className="items-center gap-2">
            <CircularProgress
              progress={overallScore}
              size={140}
              strokeWidth={8}
              color={color}
              trackColor={trackColor}
            >
              <Text className="text-3xl font-semibold text-gray-700">
                {overallScore}%
              </Text>
            </CircularProgress>
            <View className="flex-row items-center gap-1.5">
              <View
                style={{ backgroundColor: color }}
                className="h-2 w-2 rounded-full"
              />
              <Text className="text-sm font-medium text-gray-500">
                {severityLabel}
              </Text>
            </View>
          </View>

          {/* Detection explanation */}
          <View className="bg-white rounded-3xl shadow-sm py-4 px-4 gap-3">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-green-50">
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#15803D"
                />
              </View>
              <Text className="flex-1 text-base font-bold text-gray-900">
                Detection Explanation
              </Text>
            </View>
            <Text className="text-sm leading-5 text-gray-500">
              {detectionDescriptions[detectionLabel]}
            </Text>
            <Text className="text-sm leading-5 text-gray-500">{message}</Text>
          </View>

          {/* Generating indicator */}
          {generating && (
            <View className="bg-white rounded-3xl shadow-sm py-10 px-6 items-center gap-3">
              <ActivityIndicator color="#15803D" size="small" />
              <Text className="text-sm text-gray-500">
                Generating your personalized routine...
              </Text>
            </View>
          )}

          {/* Recommended products */}
          {!generating &&
            resultData?.recommendations &&
            resultData.recommendations.length > 0 && (
              <View className="bg-white rounded-3xl shadow-sm py-4 px-4 gap-4">
                <Text className="font-bold text-gray-800 text-lg">
                  Recommended Products
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
            )}

          <View className="h-4" />
        </View>
      </ScrollView>

      <View className="py-6 w-full gap-2 px-6">
        <Pressable
          className={`rounded-full ${loading || generating ? "bg-gray-400" : "bg-green-700"} active:opacity-80 p-4`}
          onPress={handleConfirm}
          disabled={loading || generating}
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
          onPress={() => router.replace("/(tabs)/scan")}
          disabled={generating}
        >
          <View className="flex-row items-center justify-center gap-1">
            <Ionicons name="refresh" size={16} color="#15803D" />
            <Text className="text-center font-bold text-green-700">
              Scan Again
            </Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
