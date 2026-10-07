import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

import { getDatabase } from "@/lib/db";
import { handleInvalidSession } from "@/lib/db/auth";
import { theme } from "@/lib/theme";
import { ScreenGradient } from "@/components/ScreenGradient";
import { supabase, validateSession } from "@/utils/supabase";

// Every await on cold start can hang forever (never resolve/reject):
// AsyncStorage locked after a phone restart, SQLite WAL recovery after an
// unclean shutdown, supabase-js internal lock, or a radio that is still
// connecting (requests neither fail nor succeed). Without timeouts the
// splash spinner sticks forever even though the cloud data is already
// cached in SQLite. So each step races against a timeout and the whole
// boot is offline-first: local cache decides the route, network only
// validates in the background / when there is no cache.
function withTimeout<T>(promise: Promise<T> | PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[index] ${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).then(
    (value) => {
      if (timer) clearTimeout(timer);
      return value as T;
    },
    (err) => {
      if (timer) clearTimeout(timer);
      throw err;
    },
  );
}

// Stuck-loader watchdog: even with per-step timeouts, show an escape hatch
// so the user is never trapped on the spinner with no feedback.
const STUCK_AFTER_MS = 12_000;

export default function Index() {
  const router = useRouter();
  const [stuck, setStuck] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const routedRef = useRef(false);

  const safeReplace = useCallback(
    (path: "/onboarding" | "/welcome" | "/(tabs)" | "/(user-setup)") => {
      if (routedRef.current) return;
      routedRef.current = true;
      try {
        router.replace(path);
      } catch {
        // Navigation not ready yet (cold start race) — retry once shortly.
        routedRef.current = false;
        setTimeout(() => {
          if (routedRef.current) return;
          routedRef.current = true;
          try {
            router.replace(path);
          } catch {}
        }, 500);
      }
    },
    [router],
  );

  useEffect(() => {
    routedRef.current = false;
    let mounted = true;
    const stuckTimer = setTimeout(() => {
      if (mounted && !routedRef.current) setStuck(true);
    }, STUCK_AFTER_MS);

    const initialize = async () => {
      try {
        // 1. Onboarding flag — device-only, fail open to onboarding check.
        let isOnboarded: string | null = null;
        try {
          isOnboarded = await withTimeout(
            AsyncStorage.getItem("is_onboarded"),
            4000,
            "onboarding flag",
          );
        } catch (err) {
          console.warn("[index] onboarding check inconclusive, continuing:", err);
        }
        if (!mounted || routedRef.current) return;
        if (isOnboarded !== "true") {
          safeReplace("/onboarding");
          return;
        }

        // 2. SQLite handle — best effort. If it hangs/times out the tabs
        // still render empty states, so don't trap boot on it.
        try {
          await withTimeout(getDatabase(), 8000, "database open");
        } catch (err) {
          console.warn("[index] database open inconclusive, continuing:", err);
        }
        if (!mounted || routedRef.current) return;

        // 3. Cached session (AsyncStorage-only, no network).
        let cachedSession = null;
        try {
          const { data } = await withTimeout(
            supabase.auth.getSession(),
            5000,
            "cached session",
          );
          cachedSession = data.session;
        } catch (err) {
          console.warn("[index] cached session read failed:", err);
        }
        if (!mounted || routedRef.current) return;
        if (!cachedSession?.user) {
          safeReplace("/welcome");
          return;
        }
        const userId = cachedSession.user.id;

        // 4. OFFLINE-FIRST: local user_setup decides the route — no network
        // wait on the happy path. validateSession() (network) used to run
        // before this and added 10s+ on every offline cold start.
        try {
          const db = await withTimeout(getDatabase(), 8000, "database handle");
          const localProfile = await withTimeout(
            db.getFirstAsync<{ user_setup: number | null }>(
              `SELECT user_setup FROM user_profile WHERE id = ?`,
              [userId],
            ),
            8000,
            "local profile read",
          );
          if (!mounted || routedRef.current) return;
          if (localProfile?.user_setup === 1) {
            // Cached profile says setup is done — go to tabs immediately.
            // Server re-validation happens in SyncManager / _layout (they
            // purge + redirect to /welcome if the account is really gone).
            safeReplace("/(tabs)");
            return;
          }
        } catch (err) {
          console.warn("[index] local profile check inconclusive:", err);
        }
        if (!mounted || routedRef.current) return;

        // 5. No local cache — server decides. validateSession fails open to
        // the cached session while offline (12s outer watchdog inside).
        let session = null;
        try {
          session = await withTimeout(validateSession(), 15000, "session validation");
        } catch (err) {
          console.warn("[index] validation inconclusive, staying offline-first:", err);
          // Offline with a cached session but no local profile — still go
          // to tabs (empty state) instead of trapping the loader.
          safeReplace("/(tabs)");
          return;
        }
        if (!mounted || routedRef.current) return;
        if (!session?.user) {
          try {
            await withTimeout(handleInvalidSession(), 8000, "invalid session purge");
          } catch {}
          safeReplace("/welcome");
          return;
        }

        // 6. No local cache — check server for user_setup. Offline (error)
        // still goes to tabs per the original fail-open behavior.
        try {
          const setupRes = (await withTimeout(
            supabase
              .from("user_profile")
              .select("user_setup")
              .eq("id", session.user.id)
              .maybeSingle(),
            10000,
            "server setup check",
          )) as { data: { user_setup?: boolean | null } | null; error: unknown };
          const { data: userSetup, error: setupError } = setupRes;
          if (!mounted || routedRef.current) return;
          if (setupError) {
            safeReplace("/(tabs)");
            return;
          }
          if (userSetup?.user_setup !== true) {
            safeReplace("/(user-setup)");
            return;
          }
          safeReplace("/(tabs)");
        } catch (err) {
          console.warn("[index] server setup check inconclusive, going to tabs:", err);
          safeReplace("/(tabs)");
        }
      } catch (err) {
        // Never leave this as an uncaught promise (was surfacing as
        // "Uncaught (in promise, id: 0)" with the sqlite NPE). Route
        // somewhere safe; tabs render empty states when the DB is down.
        console.error("[index] init failed:", err);
        safeReplace("/(tabs)");
      }
    };
    initialize();

    return () => {
      mounted = false;
      clearTimeout(stuckTimer);
    };
  }, [router, attempt, safeReplace]);

  return (
    <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ActivityIndicator size="large" color="#15803D" />
      {stuck && (
        <View className="items-center mt-6 gap-2">
          <Text className="text-sm text-center" style={{ color: "#6B7280" }}>
            Taking longer than expected — your offline data is safe.
          </Text>
          <Pressable
            onPress={() => {
              setStuck(false);
              setAttempt((a) => a + 1);
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading"
            className="rounded-full px-5 py-2.5 mt-1 active:opacity-70"
            style={{ backgroundColor: "#15803D" }}
          >
            <Text className="text-sm font-bold text-white">Retry</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
