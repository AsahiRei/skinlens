import { View, Text, Pressable, ScrollView } from "react-native";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useEffect, useState } from "react";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { formatter } from "@/utils/formatter";
import { supabase } from "@/utils/supabase";
import Skeleton from "@/components/Skeleton";
import Ionicons from "@react-native-vector-icons/ionicons";
import CircularProgress from "@/components/CircularProgress";
import InlineProgress from "@/components/InlineProgress";

//placeholder only
const placeholder = [
  { label: "Test 1", done: true },
  { label: "Test 2", done: false },
  { label: "Test 3", done: false },
  { label: "Test 4", done: false },
];

type UserProfile = {
  username: string;
  email: string;
  age: string;
  phone_number: string;
  created_at: any;
};

type SkinProfile = {
  skin_type: string;
  main_concerns: string;
  healthscore: string;
};

export default function Home() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [skinProfile, setSkinProfile] = useState<SkinProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingSkin, setLoadingSkin] = useState(true);
  const [hasNotifications, setHasNotifications] = useState(false);

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Good morning";
    } else if (hour < 18) {
      return "Good afternoon";
    } else {
      return "Good evening";
    }
  }

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("user_profile")
          .select("*")
          .eq("id", user?.id)
          .single();
        if (error) throw error;
        setUserProfile(data);
      } catch (err) {
        console.error("Error fetching user profile:", err);
      } finally {
        setLoadingUser(false);
      }
    };
    const fetchSkinProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("skin_profile")
          .select("*")
          .eq("id", user?.id)
          .single();
        if (error) throw error;
        setSkinProfile(data);
      } catch (err) {
        console.error("Error fetching skin profile:", err);
      } finally {
        setLoadingSkin(false);
      }
    };
    fetchUserProfile();
    fetchSkinProfile();
  }, []);

  // Derive the routine progress from real data instead of a hardcoded index check,
  // so the checklist below always matches the "X / Y done" badge above it.
  const completedCount = placeholder.filter((item) => item.done).length;
  const totalCount = placeholder.length;
  const routineProgress = totalCount
    ? Math.round((completedCount / totalCount) * 100)
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Header */}
        <View className="pt-4 flex-row items-center justify-between">
          <View className="flex-col">
            <Text className="font-semibold text-gray-500 text-base tracking-wide">
              {getGreeting()}
            </Text>
            {loadingUser ? (
              <Skeleton className="h-7 w-40 mt-1" />
            ) : (
              <Text className="font-bold text-green-700 text-2xl mt-0.5">
                {userProfile?.username}
              </Text>
            )}
          </View>
          <Pressable className="h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm active:opacity-80">
            <Ionicons name="notifications-outline" color="#15803D" size={20} />
            {hasNotifications && (
              <View className="absolute top-2 right-2.5 h-2.5 w-2.5 rounded-full bg-red-500 border border-white" />
            )}
          </Pressable>
        </View>

        {/* Skin health score */}
        <View className="bg-white rounded-3xl shadow-sm py-4 px-4 flex-row items-center gap-4 mt-5">
          <CircularProgress
            progress={Number(skinProfile?.healthscore ?? 0)}
            size={68}
            strokeWidth={6}
            color="#15803D"
            trackColor="#DCFCE7"
          >
            <Text className="text-lg font-bold text-green-700">
              {skinProfile?.healthscore ?? 0}%
            </Text>
          </CircularProgress>
          <View className="flex-col flex-1">
            <Text className="font-bold text-gray-900 text-[15px]">
              Skin Health Score
            </Text>
            {loadingSkin ? (
              <Skeleton className="w-28 h-4 mt-1" />
            ) : (
              <Text className="text-xs text-gray-500 mt-0.5">
                {formatter(
                  getHealthScoreResponse(Number(skinProfile?.healthscore ?? 0))
                    .severity,
                )}{" "}
                Progress
              </Text>
            )}
            <Pressable className="bg-green-700 rounded-full self-start px-4 py-1.5 mt-2.5 active:opacity-80">
              <Text className="text-xs text-white font-bold">
                View Progress
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Quick scan */}
        <Pressable className="bg-white rounded-3xl shadow-sm py-4 px-4 mt-4 flex-row items-center justify-between active:opacity-90">
          <View className="flex-row items-center gap-3 flex-1">
            <View className="bg-green-100 h-12 w-12 items-center justify-center rounded-2xl">
              <Ionicons name="camera-outline" size={22} color="#15803D" />
            </View>
            <View className="flex-col flex-1">
              <Text className="font-bold text-gray-900 text-[15px]">
                Quick AI Scan
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                Analyze your skin within 30 seconds
              </Text>
            </View>
          </View>
          <View className="bg-green-100 h-9 w-9 items-center justify-center rounded-full">
            <Ionicons name="arrow-forward" size={16} color="#15803D" />
          </View>
        </Pressable>

        {/* Chatbot & Progress quick actions */}
        <View className="flex-row gap-3 mt-4">
          <Pressable className="bg-white rounded-3xl shadow-sm py-4 px-4 flex-1 items-center gap-2 active:opacity-90">
            <View className="bg-green-100 h-12 w-12 items-center justify-center rounded-2xl">
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={22}
                color="#15803D"
              />
            </View>
            <Text className="font-bold text-gray-900 text-[13px] text-center">
              AI Chatbot
            </Text>
            <Text className="text-[11px] text-gray-500 text-center">
              Ask skin questions
            </Text>
          </Pressable>

          <Pressable className="bg-white rounded-3xl shadow-sm py-4 px-4 flex-1 items-center gap-2 active:opacity-90">
            <View className="bg-green-100 h-12 w-12 items-center justify-center rounded-2xl">
              <Ionicons name="trending-up-outline" size={22} color="#15803D" />
            </View>
            <Text className="font-bold text-gray-900 text-[13px] text-center">
              Progress
            </Text>
            <Text className="text-[11px] text-gray-500 text-center">
              Track your skin
            </Text>
          </Pressable>
        </View>

        {/* Morning routine */}
        <View className="bg-white rounded-3xl shadow-sm py-4 px-4 mt-4 flex-col gap-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Ionicons name="sunny" size={18} color="#15803D" />
              <Text className="font-bold text-gray-900 text-[15px]">
                Morning Routine
              </Text>
            </View>
            <View className="py-1 px-3 bg-green-50 rounded-full">
              <Text className="text-xs font-bold text-green-700">
                {completedCount} / {totalCount} done
              </Text>
            </View>
          </View>

          <InlineProgress
            progress={routineProgress}
            height={8}
            color="#15803D"
          />

          <View className="flex-row items-start justify-between gap-2 mt-1">
            {placeholder.map((item, index) => (
              <View
                key={index}
                className="flex-col items-center gap-1.5 flex-1"
              >
                <View
                  className={`h-10 w-10 rounded-full items-center justify-center ${
                    item.done ? "bg-green-700" : "bg-green-50"
                  }`}
                >
                  {item.done ? (
                    <Ionicons name="checkmark" size={16} color="white" />
                  ) : (
                    <View className="h-2.5 w-2.5 rounded-full bg-green-700/40" />
                  )}
                </View>
                <Text
                  className="text-[11px] text-gray-500 text-center"
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Last scan result */}
        <View className="bg-white rounded-3xl shadow-sm py-4 px-4 mt-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-bold text-gray-900 text-[15px]">
              Last Scan Result
            </Text>
            <Text className="text-xs text-gray-400">
              {userProfile?.created_at
                ? new Date(userProfile.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "No scans yet"}
            </Text>
          </View>

          {skinProfile ? (
            <View className="flex-row items-center gap-3 mt-3 pt-3 border-t border-gray-100">
              <View className="bg-green-50 h-11 w-11 items-center justify-center rounded-2xl">
                <Ionicons name="sparkles-outline" size={20} color="#15803D" />
              </View>
              <View className="flex-col flex-1">
                <Text className="text-sm font-semibold text-gray-800">
                  {skinProfile.skin_type ?? "Unknown"} skin
                </Text>
                <Text
                  className="text-xs text-gray-500 mt-0.5"
                  numberOfLines={1}
                >
                  Main concern: {skinProfile.main_concerns ?? "—"}
                </Text>
              </View>
              <Pressable className="active:opacity-70">
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </Pressable>
            </View>
          ) : (
            <View className="items-center py-6">
              <Ionicons name="scan-outline" size={28} color="#D1D5DB" />
              <Text className="text-xs text-gray-400 mt-2">
                Run your first scan to see results here
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
