import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, Check } from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import PulsatingIcon from "@/components/PulsatingIcon";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { PrimaryButton } from "@/components/ui";
import { cardShadow, theme } from "@/lib/theme";
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
  const ranRef = useRef(false); // guard against double-run in dev/strict mode
  const cancelledRef = useRef(false);
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
    try {
      setError(null);
      await requireUser();
      // Face enrollment is mandatory before results — bounce back to the
      // enroll step if it was skipped (e.g. via deep link).
      const face = await getFaceIdentity().catch(() => null);
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
      <SafeAreaView className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
        <ScreenGradient />
        <View className="flex-1 px-5 items-center justify-center">
          <View className="bg-white rounded-[20px] py-10 px-6 items-center gap-2 w-full" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
            <AlertCircle size={28} color="#DC2626" />
            <Text className="font-bold" style={{ color: "#10241A" }}>
              {"Couldn't generate your routine"}
            </Text>
            <Text className="text-sm text-center" style={{ color: "#6B7280" }}>{error}</Text>
            <View className="w-full mt-2">
              <PrimaryButton
                label="Try Again"
                onPress={() => {
                  ranRef.current = false;
                  run();
                }}
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <View className="flex-1 px-5">
        <View className="flex-1 items-center justify-center gap-8">
          <PulsatingIcon />
          <View className="pt-4">
            <Text className="font-bold text-[24px] text-center" style={{ color: "#10241A" }}>
              Creating Your Routine
            </Text>
            <Text className="text-center" style={{ color: "#6B7280" }}>
              Building your routine from your answers
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
                        ? theme.colors.primary
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
