import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { getSeverity } from "@/utils/severity-level";
import { Ionicons } from "@expo/vector-icons";
import { checklist } from "@/data/results";
import { formatValue } from "@/utils/format-value";
import { Cell } from "@/components/Cell";
import CircleProgress from "@/components/Circleprogress";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";

export default function ComponentName() {
  const router = useRouter();
  const { healthScore, answers } = useLocalSearchParams<{
    healthScore: string;
    answers: string;
  }>();
  const data = JSON.parse(answers);
  const score = Number(healthScore);
  const severity = getSeverity(score);
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)}>
          <View
            className="mx-5 mt-5 rounded-4xl items-center px-6 pt-10 pb-8"
            style={{
              backgroundColor: severity.bgColor,
            }}
          >
            <Text className="text-xl font-semibold uppercase tracking-widest mb-4">
              Your Skin Score
            </Text>
            <CircleProgress
              progress={score}
              strokeWidth={12}
              color={severity.color}
              backgroundColor="#e5e7eb"
            />
            <View
              className="flex-row items-center gap-2 mt-5 px-5 py-2 rounded-full"
              style={{ backgroundColor: severity.color }}
            >
              <Ionicons name="shield-checkmark" size={18} color="white" />
              <Text className="text-white font-bold text-base tracking-wide">
                {severity.label}
              </Text>
            </View>
            <Text className="text-gray-600 text-center mt-4 text-base leading-6 px-2">
              {severity.description}
            </Text>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
          <View className="mx-5 mt-8">
            <Text className="text-base font-bold uppercase tracking-widest text-gray-700 mb-3 ml-1">
              Profile Snapshot
            </Text>
            <View className="bg-white rounded-4xl overflow-hidden border border-gray-200">
              <View className="flex-row">
                <Cell
                  label="Skin Type"
                  value={formatValue(data.skin_type)}
                  color={severity.color}
                />
                <View className="w-px bg-gray-100" />
                <Cell
                  label="Main Concern"
                  value={formatValue(data.main_concern)}
                  color={severity.color}
                />
              </View>
              <View className="h-px bg-gray-100" />
              <View className="flex-row">
                <Cell
                  label="Sleep Quality"
                  value={formatValue(data.sleep_quality)}
                  color={severity.color}
                />
                <View className="w-px bg-gray-100" />
                <Cell
                  label="Stress Level"
                  value={formatValue(data.stress_level)}
                  color={severity.color}
                />
              </View>
              <View className="h-px bg-gray-100" />
              <Cell
                label="Daily Water Intake"
                value={formatValue(data.water_intake)}
                color={severity.color}
                fullWidth
              />
            </View>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <View className="mx-5 mt-8">
            <Text className="text-base font-bold uppercase tracking-widest text-gray-700 mb-3 ml-1">
              Completed Setup
            </Text>
            <View className="bg-white rounded-4xl p-5 gap-4 border border-gray-200">
              {checklist.map((item, i) => (
                <Animated.View
                  key={i}
                  entering={FadeInDown.delay(400 + i * 60).duration(300)}
                  className="flex-row items-start gap-3"
                >
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mt-0.5"
                    style={{ backgroundColor: "#f0fdf4" }}
                  >
                    <Ionicons name={item.icon} size={20} color="#15803d" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900">
                      {item.title}
                    </Text>
                    <Text className="text-sm text-gray-500 mt-0.5">
                      {item.subtitle}
                    </Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(600).duration(400)}>
          <View className="mx-5 mt-6">
            <View
              className="rounded-4xl p-6 items-center border border-gray-200"
              style={{ backgroundColor: "white" }}
            >
              <View
                className="w-14 h-14 rounded-full items-center justify-center mb-4"
                style={{ backgroundColor: severity.bgColor }}
              >
                <Ionicons name="sparkles" size={28} color={severity.color} />
              </View>
              <Text className="text-lg font-bold text-gray-900">
                Everything is Ready!
              </Text>
              <Text className="text-base text-gray-500 text-center mt-2 leading-5 px-2">
                Your personalized skincare experience has been prepared based on
                your unique skin profile and lifestyle.
              </Text>
            </View>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(700).duration(400)}>
          <View className="mx-5 mt-8 gap-4">
            <Pressable
              onPress={() => router.replace("/(user)/(tabs)")}
              className="active:opacity-80"
            >
              <View
                className="py-4 rounded-full items-center"
                style={{
                  backgroundColor: severity.color,
                }}
              >
                <Text className="text-white font-bold text-base tracking-wide">
                  View My Routine
                </Text>
              </View>
            </Pressable>
            <Text className="text-center text-gray-400">
              Your personalized skincare journey starts now.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}