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
import { theme } from "@/lib/theme";
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
  const [running, setRunning] = useState(false);
  const ranRef = useRef(false);
  const cancelledRef = useRef(false);
  // Re-entry + navigation guards: "Try Again" can be tapped repeatedly and
  // the confirm buttons fire router.replace, which would otherwise stack
  // duplicate screens if tapped twice.
  const busyRef = useRef(false);
  const navRef = useRef(false);

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
    if (busyRef.current) return;
    busyRef.current = true;
    setRunning(true);
    console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} run start isMulti=`, isMulti, `count=`, isMulti ? multiAngles.length : 1, `source=`, sourceType);
    try {
      setError(null);
      setDetectedResult(null);
      const uris = isMulti ? multiAngles : [imageUri];
      if (!uris[0]) {
        console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} run aborted: no image`);
        setError("No image provided. Please go back and try again.");
        return;
      }

      goToStep(0);

      console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} enhance start count=`, uris.length);
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
      console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} enhance done`);
      await new Promise((r) => setTimeout(r, 600));
      if (cancelledRef.current) return;

      goToStep(1);
      console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} classify start count=`, uris.length);
      const results = await Promise.all(
        uris.map((uri) => classifyImage(uri)),
      );
      if (cancelledRef.current) return;

      const finalResult = isMulti ? aggregateResults(results) : results[0];
      console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} classify done label=`, finalResult.label, `conf=`, finalResult.confidence.toFixed(3));

      goToStep(2);
      // ── Face verification gate ──
      // The scan must come from the enrolled face, otherwise the user is
      // sent to the mismatch page and can never reach the survey.
      // Accounts enrolled before this feature (no stored embedding) are
      // grandfathered through; model failures fail open with a warning so
      // a broken model file can't brick scanning.
      console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} face-verify check start`);
      const stored = await getFaceIdentity().catch((err) => {
        console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} getFaceIdentity failed:`, err);
        return null;
      });
      const enrolled = parseEmbedding(stored?.face_embedding ?? null);
      console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} face-verify stored=`, !!stored, `enrolled=`, !!enrolled);
      if (stored && enrolled) {
        try {
          const live = await getFaceEmbedding(uris[0]);
          const similarity = cosineSimilarity(live, enrolled);
          console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} face similarity=`, similarity.toFixed(3), `threshold=`, FACE_MATCH_THRESHOLD);
          if (cancelledRef.current) return;
          if (similarity < FACE_MATCH_THRESHOLD) {
            console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} face MISMATCH, redirecting`);
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
          console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} face verified`);
        } catch (e) {
          console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} face verification skipped (fail-open):`, e);
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
      console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} analysis complete, showing confirmation`);
      setFinalUris(uris as string[]);
      setDetectedResult(finalResult);
    } catch (e) {
      console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} run failed:`, e);
      if (cancelledRef.current) return;
      setError(
        e instanceof Error
          ? e.message
          : "Failed to analyze the image. Please try again.",
      );
    } finally {
      busyRef.current = false;
      if (!cancelledRef.current) setRunning(false);
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
    if (navRef.current) return;
    console.log(`[SkinLens][Analyzing] ${new Date().toISOString()} proceed to survey label=`, detectedResult?.label);
    if (!detectedResult || !finalUris[0]) return;
    navRef.current = true;
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
    if (navRef.current) return;
    navRef.current = true;
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
      <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, flexGrow: 1, justifyContent: "center" }}
        >
          <View className="items-center">
            <View
              className="h-12 w-12 rounded-full items-center justify-center"
              style={{ backgroundColor: theme.colors.primary }}
            >
              <Check size={22} color="#FFFFFF" />
            </View>
            <Text className="font-bold text-[24px] mt-3 text-center" style={{ color: theme.colors.ink }}>
              Scan Complete
            </Text>
            <Text className="text-sm mt-1 text-center" style={{ color: theme.colors.muted }}>
              {isNormal
                ? "We didn't find any major skin issues."
                : `We detected ${prettyLabel}.`}
            </Text>
          </View>

          <ClinicalCard className="mt-5 items-center gap-3 py-6 px-5">
            {previewUri ? (
              <View className="w-28 h-28 rounded-3xl overflow-hidden" style={{ aspectRatio: 1, backgroundColor: theme.colors.primarySoft }}>
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
            <Text className="text-[15px] text-center leading-6" style={{ color: theme.colors.ink }}>
              {isNormal
                ? "Your skin looks healthy. Proceed to a short survey to finalize your result?"
                : `We detected ${prettyLabel}. Proceed to a short survey to finalize your result?`}
            </Text>
            <Text className="text-xs text-center leading-5" style={{ color: theme.colors.muted }}>
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
      <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <View className="flex-1 px-5 items-center justify-center">
          <ClinicalCard className="py-10 px-6 items-center gap-2 w-full">
            <AlertCircle size={28} color={theme.colors.danger} />
            <Text className="font-bold" style={{ color: theme.colors.ink }}>Analysis failed</Text>
            <Text className="text-sm text-center" style={{ color: theme.colors.muted }}>{error}</Text>
            <View className="w-full mt-2">
              <PrimaryButton
                label="Try Again"
                loading={running}
                onPress={() => {
                  if (busyRef.current) return;
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <View className="flex-1 px-6">
        <View className="flex-1 items-center justify-center gap-8">
          {/* Image(s) with scanning line */}
          {isMulti ? (
            <View className="flex-row items-center justify-center gap-3">
              {multiAngles.map((uri, i) => (
                <View key={i} className="relative items-center">
                  <View
                    className="w-24 h-24 rounded-2xl overflow-hidden"
                    style={{ elevation: 6, aspectRatio: 1, backgroundColor: theme.colors.primarySoft }}
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
                          backgroundColor: theme.colors.primary,
                          shadowColor: theme.colors.primary,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.8,
                          shadowRadius: 6,
                          elevation: 3,
                        }}
                      />
                    </Animated.View>
                    {/* Corner brackets */}
                    <View className="absolute top-2 left-2">
                      <View style={{ width: 14, height: 14, borderTopWidth: 2, borderLeftWidth: 2, borderColor: theme.colors.primary }} />
                    </View>
                    <View className="absolute top-2 right-2">
                      <View style={{ width: 14, height: 14, borderTopWidth: 2, borderRightWidth: 2, borderColor: theme.colors.primary }} />
                    </View>
                    <View className="absolute bottom-2 left-2">
                      <View style={{ width: 14, height: 14, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: theme.colors.primary }} />
                    </View>
                    <View className="absolute bottom-2 right-2">
                      <View style={{ width: 14, height: 14, borderBottomWidth: 2, borderRightWidth: 2, borderColor: theme.colors.primary }} />
                    </View>
                  </View>
                  <Text className="text-xs font-semibold mt-2" style={{ color: theme.colors.primaryDeep }}>
                    {ANGLE_LABELS[i]}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="relative items-center justify-center">
              <View
                className="w-64 h-64 rounded-3xl overflow-hidden"
                style={{ elevation: 8, aspectRatio: 1, backgroundColor: theme.colors.primarySoft }}
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
                      backgroundColor: theme.colors.primary,
                      shadowColor: theme.colors.primary,
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
                  <View style={{ width: 20, height: 20, borderTopWidth: 3, borderLeftWidth: 3, borderColor: theme.colors.primary }} />
                </View>
                <View className="absolute top-3 right-3">
                  <View style={{ width: 20, height: 20, borderTopWidth: 3, borderRightWidth: 3, borderColor: theme.colors.primary }} />
                </View>
                <View className="absolute bottom-3 left-3">
                  <View style={{ width: 20, height: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: theme.colors.primary }} />
                </View>
                <View className="absolute bottom-3 right-3">
                  <View style={{ width: 20, height: 20, borderBottomWidth: 3, borderRightWidth: 3, borderColor: theme.colors.primary }} />
                </View>
              </View>
            </View>
          )}

          <View className="pt-2">
            <Text className="font-bold text-[24px] text-center" style={{ color: theme.colors.ink }}>
              Scanning Your Skin
            </Text>
            <Text className="text-center" style={{ color: theme.colors.muted }}>
              {isMulti
                ? `Analyzing ${multiAngles.length} angles`
                : "Analysis in progress"}
            </Text>
          </View>

          <View className="w-full gap-3">
            <Text className="text-center text-base font-medium" style={{ color: theme.colors.body }}>
              {steps[stepIndex].label}...
            </Text>
            <InlineProgress progress={progressPct} height={8} color={theme.colors.primary} trackColor={theme.colors.primarySoft} />
          </View>

          <ClinicalCard className="w-full gap-3">
            {steps.map((step, i) => {
              const isDone = i < stepIndex;
              const isActive = i === stepIndex;
              return (
                <View key={step.label} className="flex-row items-center gap-3">
                  <View
                    className="h-7 w-7 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: isDone
                        ? theme.colors.primary
                        : isActive
                          ? theme.colors.primarySoft
                          : theme.colors.background,
                    }}
                  >
                    {isDone ? (
                      <Check size={14} color="#FFFFFF" />
                    ) : (
                      <Text
                        className="text-xs font-bold"
                        style={{ color: isActive ? theme.colors.primary : theme.colors.faint }}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    className="text-sm"
                    style={{
                      color: isDone || isActive ? theme.colors.ink : theme.colors.faint,
                      fontWeight: isActive ? "700" : "400",
                      textDecorationLine: isDone ? "line-through" : "none",
                    }}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </ClinicalCard>
        </View>
      </View>
    </SafeAreaView>
  );
}
