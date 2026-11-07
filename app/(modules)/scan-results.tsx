import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, ScrollView, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, FileText, Info } from "lucide-react-native";

import CircularProgress from "@/components/CircularProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ClinicalCard, Notice, PrimaryButton, SecondaryButton, UiModal } from "@/components/ui";
import { theme } from "@/lib/theme";
import Animated from "react-native-reanimated";
import { AnimatedBarFill, enterUp, fadeIn, fadeOut, listLayout, popIn } from "@/components/motion";
import {
  getLifestyleProfile,
  getSensitivityHistory,
  getSkinProfile,
  insertResult,
  insertRoutine,
} from "@/lib/db";
import type { ResultData } from "@/types/schema";
import { uploadImageToCloudinary } from "@/utils/cloudinary";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { ingredientsAvoidedBySensitivity } from "@/utils/knowledge";
import { generateRoutine } from "@/utils/routine-generator";
import { ScreenGradient } from "@/components/ScreenGradient";
import { UrgentCareModal } from "@/components/UrgentCareModal";
import { markUrgentCareReminded, needsUrgentCare } from "@/utils/urgent-care";
import { assessDetection, computeOverallScore, prettyLabel } from "@/utils/detection-score";

const detectionDescriptions: Record<string, string> = {
  acne: "Our AI found signs consistent with acne on your skin. Acne is a common skin condition caused by clogged pores, excess oil, and bacteria. With the right routine, it can be managed effectively.",
  dry: "Our AI detected that your skin tends to be dry. Dry skin lacks moisture and can feel tight, rough, or flaky. A hydrating routine can help restore your skin's moisture barrier.",
  eczema:
    "Our AI found signs consistent with eczema. Eczema is a condition that causes dry, itchy, and inflamed patches of skin. Only a doctor can confirm it, so please have a dermatologist check it, especially if it itches, cracks or spreads. A gentle routine can help in the meantime.",
  oily: "Our AI detected that your skin tends to be oily. Excess oil production can lead to shine and clogged pores. A balanced routine can help control oil without over-drying.",
  normal:
    "No significant skin conditions were detected. Your skin appears healthy. A good maintenance routine will help keep it that way.",
};

export default function ScanResults() {
  const router = useRouter();
  const { imageUri, sourceType, label, confidence, probabilities, surveyAnswers, severityScore } =
    useLocalSearchParams<{
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
  const probabilityMap: Record<string, number> | null = useMemo(() => {
    if (!probabilities) return null;
    try {
      const parsed: unknown = JSON.parse(probabilities);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
      }
      return Object.keys(clean).length > 0 ? clean : null;
    } catch {
      return null;
    }
  }, [probabilities]);
  const topPredictions: { label: string; confidence: number }[] = useMemo(() => {
    if (probabilityMap) {
      return Object.entries(probabilityMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([predLabel, predConf]) => ({ label: predLabel, confidence: predConf }));
    }
    // Fallback when probabilities are missing/malformed: show top detection only.
    return [{ label: detectionLabel, confidence: conf }];
  }, [probabilityMap, detectionLabel, conf]);
  const assessment = assessDetection(conf, probabilityMap);
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

  // Overall health score: probability-weighted detection baseline blended
  // with the survey severity (see utils/detection-score.ts).
  const overallScore = computeOverallScore(detectionLabel, probabilityMap, surveyScore);

  const [skinType, setSkinType] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(true);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  // Severe survey answers: warn as soon as the results appear.
  const [urgentVisible, setUrgentVisible] = useState(() =>
    needsUrgentCare(detectionLabel, parsedSurveyAnswers),
  );
  const ranRef = useRef(false);
  const cancelledRef = useRef(false);
  const busyRef = useRef(false);
  const savingRef = useRef(false);
  const routineJsonRef = useRef<string | null>(null);

  const showNotice = (message: string, title = "SkinLens") => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      setNotice({ title, message });
    }
  };

  const {
    label: severityLabel,
    message,
    color,
    trackColor,
  } = getHealthScoreResponse(overallScore, {
    skin_type: skinType,
    main_concern: detectionLabel,
  });

  const decodedUri = imageUri
    ? (() => {
        try {
          return decodeURIComponent(imageUri);
        } catch {
          return imageUri;
        }
      })()
    : null;

  // Builds the routine for preview only. Nothing is persisted or uploaded
  // here — that happens in handleConfirm, so "Scan Again" / back discards it.
  const generatePreview = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      setGenerating(true);
      setError(null);

      // Rule-based routine: no model download — just read profiles, then
      // build the routine deterministically from the knowledge base.
      const [skinProfile, lifestyleProfile] = await Promise.all([
        getSkinProfile(),
        getLifestyleProfile(),
      ]);
      if (cancelledRef.current) return;
      const resolvedSkinType = skinProfile?.skin_type || "normal";
      setSkinType(resolvedSkinType);

      // Personalisation inputs (best-effort): the profile's free-text
      // concerns re-rank the knowledge base, and ingredients the patient
      // logged as triggers are dropped when alternatives exist.
      const sensitivity = await getSensitivityHistory().catch(() => []);
      if (cancelledRef.current) return;
      const avoidIngredients = ingredientsAvoidedBySensitivity(sensitivity);

      const routineJson = await generateRoutine({
        skin_type: resolvedSkinType,
        main_concern: detectionLabel,
        sleep_quality: lifestyleProfile?.sleep_quality ?? "fair",
        stress_level: lifestyleProfile?.stress_level ?? "moderate",
        water_intake: lifestyleProfile?.water_intake ?? "1_to_1_5l",
        health_score: overallScore,
        profile_concerns: skinProfile?.main_concerns ?? null,
        avoid_ingredients: avoidIngredients,
      });
      if (cancelledRef.current) return;
      const healthResponse = getHealthScoreResponse(overallScore, {
        skin_type: resolvedSkinType,
        main_concern: detectionLabel,
      });
      const parsedRoutine = JSON.parse(routineJson);
      routineJsonRef.current = routineJson;
      setResultData({
        severity: healthResponse.severity,
        description: healthResponse.message,
        healthscore: overallScore,
        recommendations: parsedRoutine.recommended_products ?? null,
      });
    } catch (e) {
      if (cancelledRef.current) return;
      console.error("[scan-results] Error:", e);
      setError(
        e instanceof Error ? e.message : "Failed to generate your routine. Please try again.",
      );
    } finally {
      busyRef.current = false;
      if (!cancelledRef.current) setGenerating(false);
    }
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    generatePreview();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist only when the user confirms: save routine, upload the image to Cloudinary, insert the
  // result.
  const handleConfirm = async () => {
    if (savingRef.current || !resultData || !routineJsonRef.current) return;
    savingRef.current = true;
    setLoading(true);
    try {
      await insertRoutine(routineJsonRef.current);

      const cloudinaryUrl = decodedUri ? await uploadImageToCloudinary(decodedUri) : null;
      if (cloudinaryUrl) {
        showNotice("Image uploaded to cloud");
      }

      await insertResult({
        severity: resultData.severity,
        description: resultData.description,
        healthscore: resultData.healthscore,
        recommendations: resultData.recommendations,
        image_url: cloudinaryUrl ?? null,
        local_image_uri: decodedUri ?? null,
        source_type: `scan_${sourceType ?? "gallery"}`,
        confidence: conf > 0 ? conf : null,
        detection_label: detectionLabel,
        survey_answers: JSON.stringify(parsedSurveyAnswers),
      });
      router.replace("/(tabs)/scan");
    } catch (e) {
      console.error("[scan-results] Save error:", e);
      savingRef.current = false;
      showNotice("Couldn't save your result. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <UiModal
          visible={notice !== null}
          onDismiss={() => setNotice(null)}
          title={notice?.title ?? ""}
          message={notice?.message}
          actions={[{ label: "Got it", onPress: () => setNotice(null) }]}
        />
        <View className="flex-1 px-5 items-center justify-center">
          <Animated.View entering={popIn} className="w-full">
            <ClinicalCard className="py-10 px-6 items-center gap-2 w-full">
              <AlertCircle size={28} color={theme.colors.danger} />
              <Text className="font-bold" style={{ color: theme.colors.ink }}>
                {"Couldn't generate results"}
              </Text>
              <Text className="text-sm text-center" style={{ color: theme.colors.muted }}>
                {error}
              </Text>
              <View className="w-full mt-2">
                <PrimaryButton
                  label="Try Again"
                  loading={generating}
                  onPress={() => {
                    if (generating) return;
                    ranRef.current = false;
                    generatePreview();
                  }}
                />
              </View>
              <View className="w-full mt-1">
                <SecondaryButton label="Go Back" onPress={() => router.back()} />
              </View>
            </ClinicalCard>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <UiModal
        visible={notice !== null}
        onDismiss={() => setNotice(null)}
        title={notice?.title ?? ""}
        message={notice?.message}
        actions={[{ label: "Got it", onPress: () => setNotice(null) }]}
      />
      <UrgentCareModal
        visible={urgentVisible}
        showFindDoctor={false}
        onClose={() => {
          setUrgentVisible(false);
          markUrgentCareReminded();
        }}
      />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 px-5 gap-5">
          <Animated.View entering={enterUp(0)} className="pt-4 items-center">
            <Text className="font-bold text-[24px] mt-1" style={{ color: theme.colors.ink }}>
              Scan Results
            </Text>
            <Text style={{ color: theme.colors.muted }}>Your skin analysis</Text>
          </Animated.View>

          {/* Scanned image */}
          {imageUri && (
            <Animated.View entering={popIn.delay(80)} className="items-center">
              <View
                className="w-40 h-40 rounded-3xl overflow-hidden bg-gray-200 shadow-sm"
                style={{ aspectRatio: 1 }}
              >
                <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
              </View>
            </Animated.View>
          )}

          {/* Detection class & confidence */}
          <Animated.View entering={enterUp(2)} className="items-center gap-2">
            <Text className="text-xl font-bold text-gray-800 capitalize">
              {prettyLabel(detectionLabel)}
            </Text>
            {conf > 0 && (
              <Text className="text-sm" style={{ color: theme.colors.muted }}>
                Confidence: {(conf * 100).toFixed(1)}%
              </Text>
            )}
          </Animated.View>

          {/* Health score */}
          <Animated.View entering={enterUp(3)} className="items-center gap-2">
            <CircularProgress
              progress={overallScore}
              size={140}
              strokeWidth={8}
              color={color}
              trackColor={trackColor}
            >
              <Text className="text-3xl font-semibold text-gray-700">
                {overallScore}
                <Text className="text-base" style={{ color: theme.colors.muted }}>
                  /100
                </Text>
              </Text>
            </CircularProgress>
            <View className="flex-row items-center gap-1.5">
              <View style={{ backgroundColor: color }} className="h-2 w-2 rounded-full" />
              <Text className="text-sm font-medium" style={{ color: theme.colors.muted }}>
                {severityLabel}
              </Text>
            </View>
          </Animated.View>

          {assessment.inconclusive && (
            <Animated.View entering={enterUp(4)}>
              <Notice
                icon={AlertCircle}
                tone="warning"
                copy="Low-confidence result: the AI wasn't sure about this photo, so treat this score as a rough estimate. A retake in even, natural light gives a more reliable result."
              />
            </Animated.View>
          )}

          {/* Top 3 classifications */}
          <Animated.View entering={enterUp(5)}>
            <ClinicalCard className="gap-3">
              <Text className="font-bold text-[16px]" style={{ color: theme.colors.ink }}>
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
                          className="h-6 w-6 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: isTop ? theme.colors.ink : theme.colors.background,
                          }}
                        >
                          <Text
                            className="text-xs font-bold"
                            style={{ color: isTop ? "#FFFFFF" : theme.colors.muted }}
                          >
                            {index + 1}
                          </Text>
                        </View>
                        <Text
                          className="text-sm font-bold capitalize"
                          style={{ color: theme.colors.ink }}
                        >
                          {pred.label}
                        </Text>
                      </View>
                      <Text className="text-sm font-medium" style={{ color: theme.colors.muted }}>
                        {pct.toFixed(1)}%
                      </Text>
                    </View>
                    <View
                      className="h-2 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: theme.colors.background }}
                    >
                      <AnimatedBarFill
                        percent={pct}
                        delay={350 + index * 120}
                        color={isTop ? theme.colors.primary : "#A7C4B1"}
                      />
                    </View>
                  </View>
                );
              })}
            </ClinicalCard>
          </Animated.View>

          {/* Detection explanation */}
          <Animated.View entering={enterUp(6)}>
            <ClinicalCard className="gap-3">
              <View className="flex-row items-center gap-3">
                <View
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.colors.primarySoft }}
                >
                  <FileText size={20} color={theme.colors.primary} />
                </View>
                <Text className="flex-1 text-base font-bold" style={{ color: theme.colors.ink }}>
                  Detection Explanation
                </Text>
              </View>
              <Text className="text-sm leading-5" style={{ color: theme.colors.body }}>
                {detectionDescriptions[detectionLabel]}
              </Text>
              <Text className="text-sm leading-5" style={{ color: theme.colors.body }}>
                {message}
              </Text>
            </ClinicalCard>
          </Animated.View>

          {/* Generating indicator */}
          {generating && (
            <Animated.View entering={fadeIn} exiting={fadeOut}>
              <ClinicalCard className="py-10 px-6 items-center gap-3">
                <ActivityIndicator color={theme.colors.primary} size="small" />
                <Text className="text-sm" style={{ color: theme.colors.muted }}>
                  Generating your routine...
                </Text>
              </ClinicalCard>
            </Animated.View>
          )}

          {/* Recommended products */}
          {!generating && resultData?.recommendations && resultData.recommendations.length > 0 && (
            <Animated.View entering={enterUp(1)} layout={listLayout}>
              <ClinicalCard className="gap-4">
                <Text className="font-bold text-[16px]" style={{ color: theme.colors.ink }}>
                  Recommended Products
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
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: theme.colors.primaryDeep }}
                          >
                            {ingredient}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text className="text-xs mt-1" style={{ color: theme.colors.muted }}>
                      {product.reason}
                    </Text>
                  </View>
                ))}
              </ClinicalCard>
            </Animated.View>
          )}

          <Animated.View entering={enterUp(7)} layout={listLayout}>
            <Notice
              icon={Info}
              tone="info"
              copy="SkinLens results are AI estimates for information only, not a medical diagnosis. Consult a licensed dermatologist for persistent, severe or worsening skin concerns."
            />
          </Animated.View>

          <View className="h-4" />
        </View>
      </ScrollView>

      <View className="py-6 w-full gap-2 px-5">
        <PrimaryButton
          label="Confirm Result"
          onPress={handleConfirm}
          disabled={loading || generating}
          loading={loading}
        />
        <SecondaryButton label="Scan Again" onPress={() => router.replace("/(tabs)/scan")} />
      </View>
    </SafeAreaView>
  );
}
