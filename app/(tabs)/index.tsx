import { View, Text, Pressable } from "react-native";
import { useEffect, useState } from "react";
import { getHealthScoreResponse } from "@/utils/healthscore";
import { formatter } from "@/utils/formatter";
import { supabase } from "@/utils/supabase";
import Skeleton from "@/components/Skeleton";
import Ionicons from "@react-native-vector-icons/ionicons";
import CircularProgress from "@/components/CircularProgress";

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
  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "GOOD MORNING";
    } else if (hour < 18) {
      return "GOOD AFTERNOON";
    } else {
      return "GOOD EVENING";
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
    //skin profile
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
  return (
    <View className="flex-1">
      <View className="bg-green-800 px-6 pt-12 pb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-col">
            <Text className="font-semibold text-gray-300 text-sm">
              {getGreeting()}
            </Text>
            {loadingUser ? (
              <Skeleton className="h-7 w-40 mb-2" />
            ) : (
              <Text className="font-bold text-white text-2xl">
                {userProfile?.username}
              </Text>
            )}
          </View>
          <Pressable className="bg-white/30 h-10 w-10 items-center justify-center rounded-full active:opacity-80">
            <Ionicons name="notifications" color="white" size={18} />
          </Pressable>
        </View>
        <View className="bg-white/30 mt-4 p-4 rounded-4xl flex-row items-center gap-2">
          <CircularProgress
            progress={Number(skinProfile?.healthscore ?? 0)}
            size={70}
            strokeWidth={6}
            color="#F9F6EE"
            trackColor="#CFCFCF"
          >
            <Text className="text-xl font-semibold text-white">
              {skinProfile?.healthscore}%
            </Text>
          </CircularProgress>
          <View className="flex-col">
            <Text className="font-semibold text-white text-xl">
              Skin Health Score
            </Text>
            <Text className="text-gray-100 text-sm">
              {formatter(
                getHealthScoreResponse(Number(skinProfile?.healthscore ?? 0))
                  .severity,
              )}{" "}
              Progress
            </Text>
            <Pressable className="bg-white/40 rounded-xl self-start px-4 py-1 mt-2">
              <Text className="text-sm text-white font-semibold">
                View Progress
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
