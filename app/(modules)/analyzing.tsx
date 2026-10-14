import { useEffect, useMemo, useRef, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, ArrowRight, Check, RefreshCw } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import InlineProgress from "@/components/InlineProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ClinicalCard, PrimaryButton, SecondaryButton } from "@/components/ui";
import { theme, cardShadow } from "@/lib/theme";
import stepsData from "@/data/steps.json";
import detectionMetaJson from "@/data/detection-meta.json";
import { classifyImage, enhanceImage } from "@/utils/skin-prediction";
import { getFaceIdentity } from "@/lib/db/profile";
import {
  cosineSimilarity,
  FACE_MATCH_THRESHOLD,
  getFaceEmbedding,
  parseEmbedding,
} from "@/utils/face-embeddings";
import type { ClassificationResult } from "@/types/skin";
import { ScreenGradient } from "@/components/ScreenGradient";

const steps = stepsData.analyzing;

const ANGLE_LABELS = stepsData.angleLabels;

const detectionMeta: Record<
  string,
  { icon: string; color: string; bg: string; description: string }
> = detectionMetaJson;

export default function Analyzing() {
  const router = useRouter();
  const { imageUri, sourceType, imageUris } = useLocalSearchParams<{
    imageUri: string;
    sourceType: string;
    imageUris?: string;
  }>();
  const [stepIndex, setStepIndex] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [displayUris, setDisplayUris] = useState<(string | null)[]>([null, null, null]);
  const [detectedResult, setDetectedResult] = useState<ClassificationResult | null>(null);
  const [finalUris, setFinalUris] = useState<string[]>([]);
  const ranRef = useRef(false);
  const cancelledRef = useRef(false);

  // imageUris comes from navigation params — never trust it blindly.
  const multiAngles: string[] = useMemo(() => {
    if (!imageUris) return [];
    try {
      const parsed: unknown = JSON.parse(imageUris);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v): v is string => typeof v === "string");
    } catch {
      return [];
    }
  }, [imageUris]);
  const isMulti = multiAngles.length > 1;

  const scanLineY = useSharedValue(0);

  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, {
        duration: 1800,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [scanLineY]);

  const scanLineStyle = useAnimatedStyle(() => ({
    top: `${scanLineY.value * 100}%`,
  }));

  const goToStep = (i: number) => {
    setStepIndex(i);
    setProgressPct(Math.round(((i + 1) / steps.length) * 100));
  };

  const aggregateResults = (results: ClassificationResult[]): ClassificationResult => {
    const avgProbabilities: Record<string, number> = {};
    const labels = Object.keys(results[0].probabilities);
    labels.forEach((label) => {
      avgProbabilities[label] =
        results.reduce((sum, r) => sum + (r.probabilities[label] ?? 0), 0) / results.length;
    });
    let bestLabel = labels[0];
    let bestConf = 0;
    Object.entries(avgProbabilities).forEach(([label, conf]) => {
      if (conf > bestConf) {
        bestLabel = label;
        bestConf = conf;
      }
    });
    return { label: bestLabel, confidence: bestConf, probabilities: avgProbabilities };
  };

  const run = async () => {
    try {
      setError(null);
      setDetectedResult(null);
      const uris = isMulti ? multiAngles : [imageUri];
      if (!uris[0]) {
        setError("No image provided. Please go back and try again.");
        return;
      }

      goToStep(0);

      if (isMulti) {
        const enhanced = await Promise.all(
          uris.map((uri) => enhanceImage(uri)),
        );
        if (cancelledRef.current) return;
        setDisplayUris(enhanced);
      } else {
        const enhanced = await enhanceImage(uris[0]);
        if (cancelledRef.current) return;
        setDisplayUris([enhanced]);
      }
      await new Promise((r) => setTimeout(r, 600));
      if (cancelledRef.current) return;

      goToStep(1);
      const results = await Promise.all(
        uris.map((uri) => classifyImage(uri)),
      );
      if (cancelledRef.current) return;

      const finalResult = isMulti ? aggregateResults(results) : results[0];

      goToStep(2);
      // ── Face verification gate ──
      // The scan must come from the enrolled face, otherwise the user is
      // sent to the mismatch page and can never reach the survey.
      // Accounts enrolled before this feature (no stored embedding) are
      // grandfathered through; model failures fail open with a warning so
      // a broken model file can't brick scanning.
      const stored = await getFaceIdentity().catch(() => null);
      const enrolled = parseEmbedding(stored?.face_embedding ?? null);
      if (stored && enrolled) {
        try {
          const live = await getFaceEmbedding(uris[0]);
          const similarity = cosineSimilarity(live, enrolled);
          if (cancelledRef.current) return;
          if (similarity < FACE_MATCH_THRESHOLD) {
            router.replace({
              pathname: "/(modules)/face-mismatch",
              params: {
                imageUri: uris[0],
                sourceType: sourceType ?? "gallery",
                label: finalResult.label,
                confidence: String(finalResult.confidence),
                probabilities: JSON.stringify(finalResult.probabilities),
                similarity: similarity.toFixed(3),
              },
            });
            return;
          }
        } catch (e) {
          console.warn("[analyzing] face verification skipped:", e);
        }
      }
      await new Promise((r) => setTimeout(r, 400));
      if (cancelledRef.current) return;

      goToStep(3);
      // ── Detection confirmation gate ──
      // Pause here so the user sees what was detected and explicitly
      // agrees to take the short survey to finalize the result,
      // instead of auto-jumping straight into the survey.
      setFinalUris(uris as string[]);
      setDetectedResult(finalResult);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(
        e instanceof Error
          ? e.message
          : "Failed to analyze the image. Please try again.",
      );
    }
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    run();
    return () => {
      cancelledRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProceedToSurvey = () => {
    if (!detectedResult || !finalUris[0]) return;
    router.replace({
      pathname: "/(modules)/survey",
      params: {
        imageUri: finalUris[0],
        sourceType: sourceType ?? "gallery",
        label: detectedResult.label,
        confidence: String(detectedResult.confidence),
        probabilities: JSON.stringify(detectedResult.probabilities),
      },
    });
  };

  const handleRescan = () => {
    router.replace("/(tabs)/scan");
  };

  if (detectedResult) {
    const meta = detectionMeta[detectedResult.label] ?? detectionMeta.normal;
    const prettyLabel =
      detectedResult.label.charAt(0).toUpperCase() + detectedResult.label.slice(1);
    const confidencePct = Math.round(detectedResult.confidence * 100);
    const previewUri = displayUris[0] ?? finalUris[0] ?? (imageUri as string | undefined);
    const isNormal = detectedResult.label === "normal";
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
        <ScreenGradient />
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, flexGrow: 1, justifyContent: "center" }}
        >
          <View className="items-center">
            <View
              className="h-12 w-12 rounded-full items-center justify-center"
              style={{ backgroundColor: "#15803D" }}
            >
              <Check size={22} color="#FFFFFF" />
            </View>
            <Text className="font-bold text-[24px] mt-3 text-center" style={{ color: "#10241A" }}>
              Scan Complete
            </Text>
            <Text className="text-sm mt-1 text-center" style={{ color: "#6B7280" }}>
              {isNormal
                ? "We didn't find any major skin issues."
                : `We detected ${prettyLabel}.`}
            </Text>
          </View>

          <ClinicalCard className="mt-5 items-center gap-3 py-6 px-5">
            {previewUri ? (
              <View className="w-28 h-28 rounded-3xl overflow-hidden bg-[#EAF6EE]" style={{ aspectRatio: 1 }}>
                <Image source={{ uri: previewUri }} className="w-full h-full" resizeMode="cover" />
              </View>
            ) : null}
            <View
              className="rounded-full px-4 py-1.5 mt-1"
              style={{ backgroundColor: meta.bg }}
            >
              <Text className="text-sm font-bold capitalize" style={{ color: meta.color }}>
                {prettyLabel} {confidencePct > 0 ? `· ${confidencePct}%` : ""}
              </Text>
            </View>
            <Text className="text-[15px] text-center leading-6" style={{ color: "#10241A" }}>
              {isNormal
                ? "Your skin looks healthy. Proceed to a short survey to finalize your result?"
                : `We detected ${prettyLabel}. Proceed to a short survey to finalize your result?`}
            </Text>
            <Text className="text-xs text-center leading-5" style={{ color: "#6B7280" }}>
              A few quick questions help confirm the AI result and personalize your routine.
            </Text>
          </ClinicalCard>

          <View className="w-full mt-5 gap-2">
            <PrimaryButton
              label="Continue to Short Survey"
              onPress={handleProceedToSurvey}
              icon={ArrowRight}
            />
            <SecondaryButton label="Scan Again" onPress={handleRescan} icon={RefreshCw} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
        <ScreenGradient />
        <View className="flex-1 px-5 items-center justify-center">
          <ClinicalCard className="py-10 px-6 items-center gap-2 w-full">
            <AlertCircle size={28} color={theme.colors.danger} />
            <Text className="font-bold" style={{ color: theme.colors.ink }}>Analysis failed</Text>
            <Text className="text-sm text-center" style={{ color: theme.colors.muted }}>{error}</Text>
            <View className="w-full mt-2">
              <PrimaryButton
                label="Try Again"
                onPress={() => {
                  ranRef.current = false;
                  run();
                }}
              />
            </View>
            <View className="w-full mt-1">
              <SecondaryButton label="Go Back" onPress={() => router.back()} />
            </View>
          </ClinicalCard>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <View className="flex-1 px-6">
        <View className="flex-1 items-center justify-center gap-8">
          {/* Image(s) with scanning line */}
          {isMulti ? (
            <View className="flex-row items-center justify-center gap-3">
              {multiAngles.map((uri, i) => (
                <View key={i} className="relative items-center">
                  <View
                    className="w-24 h-24 rounded-2xl overflow-hidden bg-[#EAF6EE]"
                    style={{ elevation: 6, aspectRatio: 1 }}
                  >
                    {(displayUris[i] ?? uri) && (
                      <Image
                        source={{ uri: displayUris[i] ?? uri }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    )}
                    {/* Scanning line overlay */}
                    <Animated.View
                      style={scanLineStyle}
                      className="absolute left-0 right-0"
                      pointerEvents="none"
                    >
                      <View
                        style={{
                          height: 2,
                          backgroundColor: "#15803D",
                          shadowColor: "#15803D",
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.8,
                          shadowRadius: 6,
                          elevation: 3,
                        }}
                      />
                    </Animated.View>
                    {/* Corner brackets */}
                    <View className="absolute top-2 left-2">
                      <View style={{ width: 14, height: 14, borderTopWidth: 2, borderLeftWidth: 2, borderColor: "#15803D" }} />
                    </View>
                    <View className="absolute top-2 right-2">
                      <View style={{ width: 14, height: 14, borderTopWidth: 2, borderRightWidth: 2, borderColor: "#15803D" }} />
                    </View>
                    <View className="absolute bottom-2 left-2">
                      <View style={{ width: 14, height: 14, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: "#15803D" }} />
                    </View>
                    <View className="absolute bottom-2 right-2">
                      <View style={{ width: 14, height: 14, borderBottomWidth: 2, borderRightWidth: 2, borderColor: "#15803D" }} />
                    </View>
                  </View>
                  <Text className="text-xs font-semibold text-[#14532D] mt-2">
                    {ANGLE_LABELS[i]}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="relative items-center justify-center">
              <View
                className="w-64 h-64 rounded-3xl overflow-hidden bg-[#EAF6EE]"
                style={{ elevation: 8, aspectRatio: 1 }}
              >
                {(displayUris[0] ?? imageUri) && (
                  <Image
                    source={{ uri: displayUris[0] ?? imageUri! }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                )}
                {/* Scanning line overlay */}
                <Animated.View
                  style={scanLineStyle}
                  className="absolute left-0 right-0"
                  pointerEvents="none"
                >
                  <View
                    style={{
                      height: 3,
                      backgroundColor: "#15803D",
                      shadowColor: "#15803D",
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.8,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  />
                  <View
                    style={{
                      height: 40,
                      bottom: 0,
                      position: "absolute",
                      left: 0,
                      right: 0,
                      backgroundColor: "rgba(21, 128, 61, 0.08)",
                    }}
                  />
                </Animated.View>
                {/* Corner brackets */}
                <View className="absolute top-3 left-3">
                  <View style={{ width: 20, height: 20, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#15803D" }} />
                </View>
                <View className="absolute top-3 right-3">
                  <View style={{ width: 20, height: 20, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#15803D" }} />
                </View>
                <View className="absolute bottom-3 left-3">
                  <View style={{ width: 20, height: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#15803D" }} />
                </View>
                <View className="absolute bottom-3 right-3">
                  <View style={{ width: 20, height: 20, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#15803D" }} />
                </View>
              </View>
            </View>
          )}

          <View className="pt-2">
            <Text className="font-bold text-[24px] text-center" style={{ color: "#10241A" }}>
              Scanning Your Skin
            </Text>
            <Text className="text-center" style={{ color: "#6B7280" }}>
              {isMulti
                ? `Analyzing ${multiAngles.length} angles`
                : "Analysis in progress"}
            </Text>
          </View>

          <View className="w-full gap-3">
            <Text className="text-center text-base font-medium" style={{ color: "#3F4A44" }}>
              {steps[stepIndex].label}...
            </Text>
            <InlineProgress progress={progressPct} height={8} color="#15803D" trackColor="#EAF6EE" />
          </View>

          <View className="bg-white rounded-[20px] py-4 px-4 w-full gap-3" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
            {steps.map((step, i) => {
              const isDone = i < stepIndex;
              const isActive = i === stepIndex;
              return (
                <View key={step.label} className="flex-row items-center gap-3">
                  <View
                    className="h-7 w-7 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: isDone
                        ? "#15803D"
                        : isActive
                          ? "#EAF6EE"
                          : "#F4F7F5",
                    }}
                  >
                    {isDone ? (
                      <Check size={14} color="#FFFFFF" />
                    ) : (
                      <Text
                        className="text-xs font-bold"
                        style={{ color: isActive ? "#15803D" : "#9CA3AF" }}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    className="text-sm"
                    style={{
                      color: isDone || isActive ? "#10241A" : "#9CA3AF",
                      fontWeight: isActive ? "700" : "400",
                      textDecorationLine: isDone ? "line-through" : "none",
                    }}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
