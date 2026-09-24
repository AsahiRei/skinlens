import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

import { getDatabase } from "@/lib/db";
import { handleInvalidSession } from "@/lib/db/auth";
import { supabase, validateSession } from "@/utils/supabase";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    const initialize = async () => {
      try {
        // local/device-only concern last (e.g. "seen onboarding carousel on this device")
        const isOnboarded = await AsyncStorage.getItem("is_onboarded");
        if (isOnboarded !== "true") {
          router.replace("/onboarding");
          return;
        }

        // Initialize SQLite database (retries internally with a fresh
        // connection if the native handle is poisoned — expo#48999)
        await getDatabase();

        const {
          data: { session: cachedSession },
        } = await supabase.auth.getSession();
        if (!cachedSession?.user) {
          router.replace("/welcome");
          return;
        }

        // Server-side check: getSession() is AsyncStorage-only, so a user
        // deleted in the Supabase dashboard would otherwise stay "signed
        // in" forever. validateSession() keeps the cached session while
        // offline (getUser can't be reached) but purges it when the server
        // rejects it, then we route to /welcome and wipe local rows.
        const session = await validateSession();
        const user = session?.user;
        if (!user) {
          await handleInvalidSession();
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

        // No local cache — check server. Note: PostgREST resolves (not
        // rejects) on network failure with { data: null, error }, so the
        // error must be checked explicitly — otherwise offline users are
        // misrouted into the setup flow.
        const { data: userSetup, error: setupError } = await supabase
          .from("user_profile")
          .select("user_setup")
          .eq("id", user.id)
          .maybeSingle();
        if (setupError) {
          // Offline (or any request failure) and no local cache — still go to
          // tabs (will show empty state)
          router.replace("/(tabs)");
          return;
        }
        if (userSetup?.user_setup !== true) {
          router.replace("/(user-setup)");
          return;
        }
        router.replace("/(tabs)");
      } catch (err) {
        // Never leave this as an uncaught promise (was surfacing as
        // "Uncaught (in promise, id: 0)" with the sqlite NPE). Route
        // somewhere safe; tabs render empty states when the DB is down.
        console.error("[index] init failed:", err);
        try {
          router.replace("/(tabs)");
        } catch {}
      }
    };
    initialize();
  }, [router]);
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#15803D" />
    </View>
  );
}
