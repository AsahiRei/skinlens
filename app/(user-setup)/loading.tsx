import { View, Text, Pressable } from "react-native";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useEffect, useRef, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { supabase } from "@/utils/supabase";
import { generateRoutine, preloadLlama } from "@/utils/routine-generator";
import PulsatingIcon from "@/components/PulsatingIcon";
import InlineProgress from "@/components/InlineProgress";

const steps = [
  { label: "Analyzing your skin profile" },
  { label: "Reviewing lifestyle factors" },
  { label: "Preparing AI model" },
  { label: "Generating your routine" },
  { label: "Finalizing your results" },
];

const MODEL_STEP_INDEX = 2;

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
  const parsedAnswers: Record<string, string> = answers
    ? JSON.parse(answers)
    : {};
  const score = Number(healthScore) || 0;

  const goToStep = (i: number) => {
    setStepIndex(i);
    setProgressPct(Math.round(((i + 1) / steps.length) * 100));
  };
  // Called repeatedly while the model downloads (first run only) to move the
  // bar smoothly within the "Preparing AI model" step instead of jumping.
  const updateModelDownloadProgress = (fraction: number) => {
    setStepIndex(MODEL_STEP_INDEX);
    setProgressPct(
      Math.round(((MODEL_STEP_INDEX + fraction) / steps.length) * 100),
    );
  };

  const run = async () => {
    try {
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You need to be signed in to continue.");
      goToStep(0);
      const { error: profileErr } = await supabase
        .from("user_profile")
        .update({
          gender: parsedAnswers.gender,
        })
        .eq("id", user?.id)
        .single();
      if (profileErr) throw new Error(profileErr.message);
      const { error: skinErr } = await supabase
        .from("skin_profile")
        .upsert({
          id: user.id,
          skin_type: parsedAnswers.skin_type,
          main_concerns: parsedAnswers.main_concern,
          healthscore: healthScore,
        })
        .single();
      if (skinErr) throw new Error(skinErr.message);
      goToStep(1);
      const { error: lifestyleErr } = await supabase
        .from("lifestyle_profile")
        .upsert({
          id: user.id,
          sleep_quality: parsedAnswers.sleep_quality,
          stress_level: parsedAnswers.stress_level,
          water_intake: parsedAnswers.water_intake,
        })
        .single();
      if (lifestyleErr) throw new Error(lifestyleErr.message);
      goToStep(MODEL_STEP_INDEX);
      // On first run this downloads + loads the on-device model (can take a
      // while); on later runs the model is already cached and this resolves fast.
      await preloadLlama(updateModelDownloadProgress);
      goToStep(3);
      const routineJson = await generateRoutine({
        skin_type: parsedAnswers.skin_type,
        main_concern: parsedAnswers.main_concern,
        sleep_quality: parsedAnswers.sleep_quality,
        stress_level: parsedAnswers.stress_level,
        water_intake: parsedAnswers.water_intake,
        health_score: score,
      });
      const { error: insertRoutineError } = await supabase
        .from("routines")
        .insert({
          user_id: user?.id,
          source_type: "ai_generated",
          routine_json: routineJson,
        })
        .select()
        .single();
      if (insertRoutineError) throw new Error(insertRoutineError.message);
      goToStep(4);
      // brief pause so the last step is visibly checked off before navigating
      await new Promise((r) => setTimeout(r, 400));
      router.replace({
        pathname: "/(user-setup)/results",
        params: { healthScore, answers },
      });
    } catch (e) {
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
  }, []);

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 px-6 items-center justify-center">
          <View className="bg-white rounded-3xl shadow-sm py-10 px-6 items-center gap-2 w-full">
            <Ionicons name="alert-circle-outline" size={28} color="#B91C1C" />
            <Text className="font-bold text-gray-800">
              Couldn't generate your routine
            </Text>
            <Text className="text-sm text-gray-500 text-center">{error}</Text>
            <Pressable
              className="rounded-full bg-green-700 active:opacity-80 px-6 py-3 mt-2"
              onPress={() => {
                ranRef.current = false;
                run();
              }}
            >
              <Text className="font-bold text-white">Try Again</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 px-6">
        <View className="flex-1 items-center justify-center gap-8">
          <PulsatingIcon />
          <View className="pt-4">
            <Text className="font-bold text-green-700 text-2xl text-center">
              Creating Your Routine
            </Text>
            <Text className="text-gray-500 text-center">
              AI Personalized Skin Routine Generator
            </Text>
          </View>
          <View className="w-full gap-3">
            <Text className="text-center text-base font-medium text-gray-700">
              {steps[stepIndex].label}...
            </Text>
            <InlineProgress progress={progressPct} height={8} color="#15803D" />
          </View>

          <View className="bg-white rounded-3xl shadow-sm py-4 px-4 w-full gap-3">
            {steps.map((step, i) => {
              const isDone = i < stepIndex;
              const isActive = i === stepIndex;
              return (
                <View key={step.label} className="flex-row items-center gap-3">
                  <View
                    className={`h-7 w-7 rounded-full items-center justify-center ${
                      isDone
                        ? "bg-green-700"
                        : isActive
                          ? "bg-green-100"
                          : "bg-gray-100"
                    }`}
                  >
                    {isDone ? (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    ) : (
                      <Text
                        className={`text-xs font-bold ${
                          isActive ? "text-green-700" : "text-gray-400"
                        }`}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    className={`text-sm ${
                      isDone
                        ? "text-gray-800 line-through"
                        : isActive
                          ? "font-bold text-gray-900"
                          : "text-gray-400"
                    }`}
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
