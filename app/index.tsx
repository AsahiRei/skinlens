import { View, ActivityIndicator } from "react-native";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/utils/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    const initialize = async () => {
      // local/device-only concern last (e.g. "seen onboarding carousel on this device")
      const isOnboarded = await AsyncStorage.getItem("is_onboarded");
      if (isOnboarded !== "true") {
        router.replace("/onboarding");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/welcome");
        return;
      }
      // account-level source of truth first
      const { data: userSetup } = await supabase
        .from("user_profile")
        .select("user_setup")
        .eq("id", user.id)
        .single();
      if (userSetup?.user_setup !== true) {
        router.replace("/(user-setup)");
        return;
      }
      router.replace("/(tabs)");
    };
    initialize();
  }, []);
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#15803D" />
    </View>
  );
}
