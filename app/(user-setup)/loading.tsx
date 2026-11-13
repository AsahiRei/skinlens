import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, Check } from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import PulsatingIcon from "@/components/PulsatingIcon";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ClinicalCard, PrimaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import Animated from "react-native-reanimated";
import { enterUp, fadeIn, popIn } from "@/components/motion";
import {
  addSensitivityEntry,
  getSensitivityHistory,
  insertResult,
  insertRoutine,
  requireUser,
  upsertHealthProfile,
  upsertLifestyleProfile,
  upsertSkinProfile,
  updateUserProfile,
} from "@/lib/db";
import { loadRoutineContext, routineInput } from "@/lib/routine-refresh";
import { getFaceIdentity } from "@/lib/db/profile";
import stepsData from "@/data/steps.json";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { generateRoutine } from "@/utils/routine-generator";
import {
  type PhotoClassification,
  combineSetupBaseline,
  getSetupProfileResponse,
  sanitizeSetupAnswers,
  setupIrritants,
} from "@/utils/setup-score";
import { classifyImage } from "@/utils/skin-prediction";
import { ScreenGradient } from "@/components/ScreenGradient";

const steps = stepsData.userSetup;

export default function Loading() {
  const router = useRouter();
  const { healthScore, answers, photoUri } = useLocalSearchParams<{
    healthScore: string;
    answers: string;
    photoUri?: string;
  }>();
  // Only a local face crop from face-enroll is graded — never a remote or arbitrary URI.
  const gradingUri =
    typeof photoUri === "string" && photoUri.startsWith("file://") ? photoUri : null;
  const [stepIndex, setStepIndex] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ranRef = useRef(false); // guard against double-run in dev/strict mode
  const cancelledRef = useRef(false);
  // Re-entry gate for run(): React state can't stop a double-tap (updates
  // are async), so the ref does the real work while `busy` drives the spinner.
  const busyRef = useRef(false);
  // answers comes from navigation params — never trust it blindly.
  const parsedAnswers: Record<string, string> = useMemo(() => {
    if (!answers) return {};
    try {
      return sanitizeSetupAnswers(JSON.parse(answers));
    } catch {
      return {};
    }
  }, [answers]);

  const goToStep = (i: number) => {
    setStepIndex(i);
    setProgressPct(Math.round(((i + 1) / steps.length) * 100));
  };

  const run = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      setError(null);
      await requireUser();
      // Every await above can outlive the screen (user taps back during the
      // spinner) — re-check before each navigation or step change, otherwise
      // this effect yanks the user back into face enrollment later on.
      if (cancelledRef.current) return;
      // Face enrollment is mandatory before results — bounce back to the
      // enroll step if it was skipped (e.g. via deep link).
      const face = await getFaceIdentity().catch(() => null);
      if (cancelledRef.current) return;
      if (!face) {
        router.replace({
          pathname: "/(user-setup)/face-enroll",
          params: { healthScore: healthScore ?? "0", answers: answers ?? "{}" },
        });
        return;
      }
      goToStep(0);
      await Promise.all([
        updateUserProfile({
          username: parsedAnswers.first_name,
          first_name: parsedAnswers.first_name,
          age: parsedAnswers.age,
          gender: parsedAnswers.gender,
        }),
        upsertSkinProfile({
          skin_type: parsedAnswers.skin_type,
          main_concerns: parsedAnswers.main_concern,
        }),
        upsertLifestyleProfile({
          sleep_quality: parsedAnswers.sleep_quality,
          stress_level: parsedAnswers.stress_level,
          water_intake: parsedAnswers.water_intake,
        }),
      ]);
      // Safety context that changes what may be recommended (pregnancy, prescribed treatment).
      await upsertHealthProfile({
        pregnancy_status: parsedAnswers.pregnancy_status ?? null,
        current_treatment: parsedAnswers.current_treatment ?? null,
        sunscreen_use: parsedAnswers.sunscreen_use ?? null,
      });
      // Known irritants go into the sensitivity log as a structured entry, so every later routine
      // (scans, rebuilds) and the chatbot keep them out — not just this first routine. Skipped on
      // "Try Again" when the identical entry already exists.
      const irritants = setupIrritants(parsedAnswers);
      if (irritants.length > 0) {
        const note = `Reported at setup. Ingredients: ${irritants.join(", ")}.`;
        const history = await getSensitivityHistory().catch(() => []);
        if (!history.some((e) => e.notes === note)) {
          await addSensitivityEntry({ trigger_cause: "product", severity: "mild", notes: note });
        }
      }
      if (cancelledRef.current) return;
      goToStep(1);
      // Grade the enrollment photo with the same on-device model as scans. Any failure (model,
      // unreadable file) falls back to an answers-only baseline instead of blocking setup.
      let classification: PhotoClassification | null = null;
      if (gradingUri) {
        try {
          classification = await classifyImage(gradingUri);
        } catch (err) {
          console.warn("[user-setup] photo grading failed, using answers only:", err);
        }
      }
      if (cancelledRef.current) return;
      // Score is recomputed from the validated answers (+ photo) — the healthScore param is only
      // forwarded, never trusted.
      const baseline = combineSetupBaseline(parsedAnswers, classification);
      const score = baseline.score;
      goToStep(2);
      if (cancelledRef.current) return;
      // Same shared context as scans: the profiles just saved, the irritants just logged and the
      // safety exclusions. The user's stated concern drives the starter routine.
      const ctx = await loadRoutineContext();
      const routineJson = await generateRoutine(
        routineInput(ctx, {
          skin_type: parsedAnswers.skin_type,
          main_concern: parsedAnswers.main_concern,
          health_score: score,
        }),
      );
      const parsedRoutine = JSON.parse(routineJson);
      const healthScoreResponse = getHealthScoreResponse(score, parsedAnswers);
      // Attach the enrollment photo to this baseline result so Progress's
      // "Before vs. Today" has a "before" image from day one.
      const baselineImage = await getFaceIdentity()
        .then((f) => f?.face_image_url ?? null)
        .catch(() => null);
      await insertResult({
        severity: healthScoreResponse.severity,
        // Guidance wording, not a verdict.
        description: getSetupProfileResponse(score, parsedAnswers, baseline.photo?.label ?? null)
          .message,
        healthscore: score,
        recommendations: parsedRoutine.recommended_products ?? null,
        image_url: baselineImage,
        // A detection label marks this as photo-graded, so Progress compares later scans against
        // it. Answers-only baselines leave it null and stay out of trends (utils/result-kind).
        detection_label: baseline.photo?.label ?? null,
        confidence: baseline.photo?.confidence ?? null,
      });
      await insertRoutine(routineJson);
      if (cancelledRef.current) return;
      goToStep(3);
      // brief pause so the last step is visibly checked off before navigating
      await new Promise((r) => setTimeout(r, 400));
      if (cancelledRef.current) return;
      router.replace({
        pathname: "/(user-setup)/results",
        params: { healthScore, answers },
      });
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      busyRef.current = false;
      if (!cancelledRef.current) setBusy(false);
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

  if (error) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <View className="flex-1 px-5 items-center justify-center">
          <Animated.View entering={popIn} className="w-full">
            <ClinicalCard
              className="items-center gap-2 w-full"
              style={{ paddingVertical: 40, paddingHorizontal: 24 }}
            >
              <AlertCircle size={28} color={theme.colors.danger} />
              <Text className="font-bold" style={{ color: theme.colors.ink }}>
                {"Couldn't generate your routine"}
              </Text>
              <Text className="text-sm text-center" style={{ color: theme.colors.muted }}>
                {error}
              </Text>
              <View className="w-full mt-2">
                <PrimaryButton
                  label="Try Again"
                  loading={busy}
                  onPress={() => {
                    if (busyRef.current) return;
                    ranRef.current = false;
                    run();
                  }}
                />
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
      <View className="flex-1 px-5">
        <View className="flex-1 items-center justify-center gap-8">
          <PulsatingIcon />
          <Animated.View entering={enterUp(1)} className="pt-4">
            <Text className="font-bold text-[24px] text-center" style={{ color: theme.colors.ink }}>
              Creating Your Routine
            </Text>
            <Text className="text-center" style={{ color: theme.colors.muted }}>
              Building your routine from your photo and answers
            </Text>
          </Animated.View>
          <Animated.View entering={enterUp(2)} className="w-full gap-3">
            {/* Keyed on the step so each new label cross-fades in. */}
            <Animated.View key={stepIndex} entering={fadeIn}>
              <Text
                className="text-center text-base font-medium"
                style={{ color: theme.colors.body }}
              >
                {steps[stepIndex].label}...
              </Text>
            </Animated.View>
            <InlineProgress
              progress={progressPct}
              height={8}
              color={theme.colors.primary}
              trackColor={theme.colors.primarySoft}
            />
          </Animated.View>

          <Animated.View entering={enterUp(3)} className="w-full">
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
                        <Animated.View entering={popIn}>
                          <Check size={14} color="#FFFFFF" />
                        </Animated.View>
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
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}
