import { View, Text, Pressable } from "react-native";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useEffect, useRef, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { supabase } from "@/utils/supabase";
import { generateRoutine } from "@/utils/routine-generator";
import PulsatingIcon from "@/components/PulsatingIcon";

const steps = [
  { label: "Analyzing your skin profile" },
  { label: "Reviewing lifestyle factors" },
  { label: "Generating your routine" },
  { label: "Finalizing your results" },
];

export default function Loading() {
  const router = useRouter();
  const { healthScore, answers } = useLocalSearchParams<{
    healthScore: string;
    answers: string;
  }>();
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progress = useSharedValue(0);
  const ranRef = useRef(false); // guard against double-run in dev/strict mode
  const parsedAnswers: Record<string, string> = answers
    ? JSON.parse(answers)
    : {};
  const score = Number(healthScore) || 0;
  const goToStep = (i: number) => {
    setStepIndex(i);
    progress.value = withTiming((i + 1) / steps.length, { duration: 400 });
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
      goToStep(2);
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
      goToStep(3);
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
  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));
  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 gap-4 items-center justify-center">
          <Ionicons name="alert-circle-outline" size={40} color="#B91C1C" />
          <Text className="text-center text-base font-medium text-gray-700">
            {error}
          </Text>
          <Pressable
            className="rounded-full bg-green-800 active:opacity-80 px-6 py-3"
            onPress={() => {
              ranRef.current = false;
              run();
            }}
          >
            <Text className="font-bold text-white">Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 gap-8 items-center justify-center">
        <PulsatingIcon />
        <View className="w-full gap-3">
          <Text className="font-bold text-green-800 text-3xl text-center">
            Analyzing
          </Text>
          <Text className="text-center text-base font-medium text-gray-700">
            {steps[stepIndex].label}...
          </Text>
          <View className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <Animated.View
              style={barStyle}
              className="h-full rounded-full bg-green-800"
            />
          </View>
        </View>
        <View className="w-full gap-2">
          {steps.map((step, i) => (
            <View key={step.label} className="flex-row items-center gap-2">
              <Ionicons
                name={i < stepIndex ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={i < stepIndex ? "#166534" : "#9CA3AF"}
              />
              <Text
                className={`text-sm ${i < stepIndex ? "text-gray-800" : "text-gray-400"}`}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
