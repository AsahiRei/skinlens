import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

import { getDatabase } from "@/lib/db";
import { supabase } from "@/utils/supabase";

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

      // Initialize SQLite database
      await getDatabase();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace("/welcome");
        return;
      }

      // Check local cache first for user_setup status
      const db = await getDatabase();
      const localProfile = await db.getFirstAsync<{ user_setup: number | null }>(
        `SELECT user_setup FROM user_profile WHERE id = ?`,
        [user.id],
      );

      if (localProfile?.user_setup === 1) {
        // Has cached profile — go to tabs immediately
        router.replace("/(tabs)");
        return;
      }

      // No local cache — check server
      try {
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
      } catch {
        // Offline and no local cache — still go to tabs (will show empty state)
        router.replace("/(tabs)");
      }
    };
    initialize();
  }, []);
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#15803D" />
    </View>
  );
}
