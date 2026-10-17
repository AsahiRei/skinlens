import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, Check } from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import PulsatingIcon from "@/components/PulsatingIcon";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ClinicalCard, PrimaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import {
  insertResult,
  insertRoutine,
  requireUser,
  upsertLifestyleProfile,
  upsertSkinProfile,
  updateUserProfile,
} from "@/lib/db";
import { getFaceIdentity } from "@/lib/db/profile";
import stepsData from "@/data/steps.json";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { generateRoutine } from "@/utils/routine-generator";
import { ScreenGradient } from "@/components/ScreenGradient";

const steps = stepsData.userSetup;

export default function Loading() {
  const router = useRouter();
  const { healthScore, answers } = useLocalSearchParams<{
    healthScore: string;
    answers: string;
  }>();
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
      const parsed: unknown = JSON.parse(answers);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      return {};
    } catch {
      return {};
    }
  }, [answers]);
  const score = Number(healthScore) || 0;

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
      if (cancelledRef.current) return;
      goToStep(1);
      goToStep(2);
      if (cancelledRef.current) return;
      const routineJson = await generateRoutine({
        skin_type: parsedAnswers.skin_type,
        main_concern: parsedAnswers.main_concern,
        sleep_quality: parsedAnswers.sleep_quality,
        stress_level: parsedAnswers.stress_level,
        water_intake: parsedAnswers.water_intake,
        health_score: score,
      });
      const parsedRoutine = JSON.parse(routineJson);
      const healthScoreResponse = getHealthScoreResponse(score, parsedAnswers);
      await insertResult({
        severity: healthScoreResponse.severity,
        description: healthScoreResponse.message,
        healthscore: score,
        recommendations: parsedRoutine.recommended_products ?? null,
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
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
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
          <ClinicalCard className="items-center gap-2 w-full" style={{ paddingVertical: 40, paddingHorizontal: 24 }}>
            <AlertCircle size={28} color={theme.colors.danger} />
            <Text className="font-bold" style={{ color: theme.colors.ink }}>
              {"Couldn't generate your routine"}
            </Text>
            <Text className="text-sm text-center" style={{ color: theme.colors.muted }}>{error}</Text>
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
          <View className="pt-4">
            <Text className="font-bold text-[24px] text-center" style={{ color: theme.colors.ink }}>
              Creating Your Routine
            </Text>
            <Text className="text-center" style={{ color: theme.colors.muted }}>
              Building your routine from your answers
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
