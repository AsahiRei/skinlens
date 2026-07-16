import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { supabase } from "@/utils/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    const initializeApp = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      //if user opens the app for the first time
      const isOnboarding = await AsyncStorage.getItem("is_onboarding");
      if (!isOnboarding) {
        router.replace("/onboarding");
        return;
      }
      //if user is not authenticated
      if (!user) {
        router.replace("/welcome");
        return;
      }
      //if user login for the first time
      const { data } = await supabase
        .from("user_profiles")
        .select("users_setup")
        .eq("id", user?.id)
        .single();
      if (data?.users_setup !== true) {
        router.replace("/(user)");
        return;
      }
      //if user is authenticated
      router.replace("/(user)/(tabs)");
    };
    initializeApp();
  }, [router]);
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#15803d" />
    </View>
  );
}
