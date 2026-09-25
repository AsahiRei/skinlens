import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, FileText, RefreshCw } from "lucide-react-native";

import CircularProgress from "@/components/CircularProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  getLatestResultDetail,
  getLifestyleProfile,
  getSkinProfile,
  insertResult,
  insertRoutine,
} from "@/lib/db";
import type { ResultData } from "@/types/schema";
import { uploadImageToCloudinary } from "@/utils/cloudinary";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { generateRoutine, preloadLlama } from "@/utils/routine-generator";

const showNotice = (message: string) => {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert("SkinLens", message);
  }
};

const detectionDescriptions: Record<string, string> = {
  acne: "Our AI detected signs of acne on your skin. Acne is a common skin condition caused by clogged pores, excess oil, and bacteria. With the right routine, it can be managed effectively.",
  dry: "Our AI detected that your skin tends to be dry. Dry skin lacks moisture and can feel tight, rough, or flaky. A hydrating routine can help restore your skin's moisture barrier.",
  eczema:
    "Our AI detected signs of eczema on your skin. Eczema is a condition that causes dry, itchy, and inflamed patches of skin. A gentle skincare routine can help manage flare-ups.",
  oily: "Our AI detected that your skin tends to be oily. Excess oil production can lead to shine and clogged pores. A balanced routine can help control oil without over-drying.",
  normal:
    "No significant skin conditions were detected. Your skin appears healthy. A good maintenance routine will help keep it that way.",
};

const detectionSeverityMap: Record<string, number> = {
  normal: 85,
  dry: 60,
  oily: 55,
  acne: 55,
  eczema: 40,
};

export default function ScanResults() {
  const router = useRouter();
  const {
    imageUri,
    sourceType,
    label,
    confidence,
    probabilities,
    surveyAnswers,
    severityScore,
  } = useLocalSearchParams<{
    imageUri: string;
    sourceType: string;
    label: string;
    confidence: string;
    probabilities: string;
    surveyAnswers: string;
    severityScore: string;
  }>();

  const detectionLabel = label ?? "normal";
  const surveyScore = Number(severityScore) || 50;
  const conf = Number(confidence) || 0;
  // probabilities comes from analyzing via survey — never trust it blindly.
  const topPredictions: { label: string; confidence: number }[] = useMemo(() => {
    if (probabilities) {
      try {
        const parsed: unknown = JSON.parse(probabilities);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const entries = Object.entries(parsed as Record<string, unknown>)
            .filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === "number" && Number.isFinite(entry[1]),
            )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([predLabel, predConf]) => ({
              label: predLabel,
              confidence: predConf,
            }));
          if (entries.length > 0) return entries;
        }
      } catch {
        // fall through to fallback below
      }
    }
    // Fallback when probabilities are missing/malformed: show top detection only.
    return [{ label: detectionLabel, confidence: conf }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probabilities]);
  // surveyAnswers comes from navigation params — never trust it blindly.
  const parsedSurveyAnswers: Record<string, string> = useMemo(() => {
    if (!surveyAnswers) return {};
    try {
      const parsed: unknown = JSON.parse(surveyAnswers);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      return {};
    } catch {
      return {};
    }
  }, [surveyAnswers]);

  // Calculate overall health score: blend detection baseline with survey severity
  const detectionBaseline = detectionSeverityMap[detectionLabel] ?? 50;
  const overallScore = Math.round(detectionBaseline * 0.6 + surveyScore * 0.4);

  const [skinType, setSkinType] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(true);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);
  const cancelledRef = useRef(false);
  const downloadToastShown = useRef(false);

  const {
    label: severityLabel,
    message,
    color,
    trackColor,
  } = getHealthScoreResponse(overallScore, {
    skin_type: skinType,
    main_concern: detectionLabel,
  });

  const generateAndSave = async () => {
    try {
      setGenerating(true);
      setError(null);

      const decodedUri = imageUri
        ? (() => {
            try { return decodeURIComponent(imageUri); } catch { return imageUri; }
          })()
        : null;

      // Load the model and fetch profiles in parallel — the model load
      // dominates, so the DB reads effectively cost nothing.
      const preloadPromise = preloadLlama((fraction) => {
        if (fraction < 0.1 && !downloadToastShown.current) {
          downloadToastShown.current = true;
          showNotice("AI model is downloading. This may take a moment...");
        }
      });
      const profilesPromise = Promise.all([
        getSkinProfile(),
        getLifestyleProfile(),
      ]);
      await preloadPromise;
      if (cancelledRef.current) return;
      const [skinProfile, lifestyleProfile] = await profilesPromise;
      if (cancelledRef.current) return;
      const resolvedSkinType = skinProfile?.skin_type || "normal";
      setSkinType(resolvedSkinType);

      const routineJson = await generateRoutine({
        skin_type: resolvedSkinType,
        main_concern: detectionLabel,
        sleep_quality: lifestyleProfile?.sleep_quality ?? "fair",
        stress_level: lifestyleProfile?.stress_level ?? "moderate",
        water_intake: lifestyleProfile?.water_intake ?? "1_to_1_5l",
        health_score: overallScore,
      });
      if (cancelledRef.current) return;
      await insertRoutine(routineJson);
      const healthResponse = getHealthScoreResponse(overallScore, {
        skin_type: resolvedSkinType,
        main_concern: detectionLabel,
      });
      const parsedRoutine = JSON.parse(routineJson);

      // Upload image to Cloudinary
      const cloudinaryUrl = decodedUri
        ? await uploadImageToCloudinary(decodedUri)
        : null;
      if (cancelledRef.current) return;

      if (cloudinaryUrl) {
        showNotice("Image uploaded to cloud");
      }

      await insertResult({
        severity: healthResponse.severity,
        description: healthResponse.message,
        healthscore: overallScore,
        recommendations: parsedRoutine.recommended_products ?? null,
        image_url: cloudinaryUrl ?? null,
        local_image_uri: decodedUri ?? null,
        source_type: `scan_${sourceType ?? "gallery"}`,
        confidence: conf > 0 ? conf : null,
        detection_label: detectionLabel,
        survey_answers: JSON.stringify(parsedSurveyAnswers),
      });
      if (cancelledRef.current) return;
      const latestResult = await getLatestResultDetail();
      if (latestResult) setResultData(latestResult);
    } catch (e) {
      if (cancelledRef.current) return;
      console.error("[scan-results] Error:", e);
      setError(
        e instanceof Error
          ? e.message
          : "Failed to generate your routine. Please try again.",
      );
    } finally {
      if (!cancelledRef.current) setGenerating(false);
    }
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    generateAndSave();
    return () => {
      cancelledRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      router.replace("/(tabs)");
    } catch {
      showNotice("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 px-6 items-center justify-center">
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 px-6 items-center gap-2 w-full">
            <AlertCircle size={28} color="#B91C1C" />
            <Text className="font-bold text-gray-800">
              {"Couldn't generate results"}
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

          {/* Top 3 classifications */}
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 gap-3">
            <Text className="font-bold text-gray-800 text-lg">
              Top 3 Predictions
            </Text>
            {topPredictions.map((pred, index) => {
              const pct = Math.max(0, Math.min(100, pred.confidence * 100));
              const isTop = index === 0;
              return (
                <View key={`${pred.label}-${index}`} className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View
                        className={`h-6 w-6 items-center justify-center rounded-full ${
                          isTop ? "bg-green-700" : "bg-gray-100"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isTop ? "text-white" : "text-gray-500"
                          }`}
                        >
                          {index + 1}
                        </Text>
                      </View>
                      <Text className="text-sm font-bold text-gray-900 capitalize">
                        {pred.label}
                      </Text>
                    </View>
                    <Text className="text-sm font-medium text-gray-500">
                      {pct.toFixed(1)}%
                    </Text>
                  </View>
                  <View className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <View
                      className={isTop ? "h-full rounded-full bg-green-700" : "h-full rounded-full bg-green-300"}
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>

          {/* Detection explanation */}
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 gap-3">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-green-50">
                <FileText
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
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 px-6 items-center gap-3">
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
              <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 gap-4">
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
            <RefreshCw size={16} color="#15803D" />
            <Text className="text-center font-bold text-green-700">
              Scan Again
            </Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
