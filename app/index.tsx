<<<<<<< HEAD
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

import { getDatabase } from "@/lib/db";
import { supabase } from "@/utils/supabase";
=======
import { View, ActivityIndicator } from "react-native";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/utils/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38

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
<<<<<<< HEAD

      // Initialize SQLite database
      await getDatabase();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
=======
      const {
        data: { user },
      } = await supabase.auth.getUser();
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
      if (!user) {
        router.replace("/welcome");
        return;
      }
<<<<<<< HEAD

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
=======
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
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
    };
    initialize();
  }, []);
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#15803D" />
    </View>
  );
}
