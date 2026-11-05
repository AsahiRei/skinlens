import { useEffect, useRef } from "react";
import { AppState, StatusBar } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";
import { SafeKeyboardProvider as KeyboardProvider } from "@/components/keyboard-safe";

import { NetworkProvider } from "@/hooks/useNetwork";
import { NotificationProvider } from "@/hooks/useNotifications";
import { OfflineModal } from "@/components/OfflineModal";
import { SyncManager } from "@/components/SyncManager";
import { TutorialCoachProvider } from "@/components/TutorialCoach";
import { clearLocalUserData } from "@/lib/db/auth";
import { createSessionFromUrl, supabase } from "@/utils/supabase";
import { releaseLlama } from "@/utils/llama";

import "../global.css";

// Keep the native splash on screen until Redaction10 has loaded, so the first
// visible frame never paints in the system font. The splash is dismissed by
// the effect below; on web this is a no-op.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Crash reporting. Inert until EXPO_PUBLIC_SENTRY_DSN is set, so dev builds
// and forks without a Sentry project behave exactly as before. No PII:
// user ids only, never emails / photos / health data.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !__DEV__,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}

// Release builds: drop verbose logging. The codebase logs user ids, auth
// events and timings on almost every step, which costs JS-thread time and
// ends up in device logs (logcat) that other tooling can read. Warnings and
// errors are kept so crash reporters still see them.
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

function RootLayout() {
  const router = useRouter();
  // Coalesces rapid duplicate SIGNED_OUT events (logout fires one per
  // signOut scope + one from validateSession's purge) into a single
  // redirect so navigation never loops.
  const lastSignOutRedirect = useRef(0);
  // App-wide default typeface — components/Text.tsx applies it to every <Text>.
  // Both weights are loaded so font-bold (700) resolves to the real Bold face
  // instead of falling back to the system font (iOS resolves it at runtime;
  // Android gets it via the expo-font config plugin in app.json).
  const [fontsLoaded, fontError] = useFonts({
    "Redaction10-Regular": require("../assets/fonts/Redaction10-Regular.ttf"),
    "Redaction10-Bold": require("../assets/fonts/Redaction10-Bold.ttf"),
  });
  useEffect(() => {
    if (fontError) {
      console.warn("[SkinLens][Font] failed to load Redaction10:", fontError);
    }
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);
  useEffect(() => {
    console.log(`[SkinLens][Boot] ${new Date().toISOString()} RootLayout mount`);
    const sub = Linking.addEventListener("url", ({ url }) => {
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} deep link received`);
      createSessionFromUrl(url).catch((err) => {
        console.log(`[SkinLens][Auth] ${new Date().toISOString()} deep link session failed:`, err);
        console.warn("Failed to create session from URL:", err);
      });
    });
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          console.log(`[SkinLens][Auth] ${new Date().toISOString()} initial URL received`);
          createSessionFromUrl(url).catch((err) => {
            console.log(`[SkinLens][Auth] ${new Date().toISOString()} initial URL session failed:`, err);
            console.warn("Failed to create session from URL:", err);
          });
        }
      })
      .catch(() => {
        // No initial URL (cold start without a deep link) — nothing to do.
      });
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} onAuthStateChange event=`, event);
      if (event === "PASSWORD_RECOVERY") {
        router.push("/create-new-password");
      }
      if (event === "SIGNED_OUT") {
        // Covers refresh-token rejection after the user was deleted in the
        // dashboard (supabase-js fires SIGNED_OUT when refresh fails).
        // NOTE: no signOut() call here — SIGNED_OUT means the session is
        // already gone, and signing out again would re-emit SIGNED_OUT and
        // loop forever. Just wipe on-device rows and route to login.
        // Purge on-device rows so the deleted account leaves nothing
        // behind, then force the login screen.
        clearLocalUserData()
          .catch(() => {})
          .finally(() => {
            const now = Date.now();
            if (now - lastSignOutRedirect.current < 2000) return;
            lastSignOutRedirect.current = now;
            try {
              router.replace("/welcome");
            } catch {}
          });
      }
    });
    // Free the on-device LLM from memory when the app goes to background.
    // The singleton re-initializes on next use via getLlamaContext.
    const appStateSub = AppState.addEventListener("change", (state) => {
      console.log(`[SkinLens][Boot] ${new Date().toISOString()} AppState=`, state);
      if (state === "background") {
        releaseLlama().catch(() => {});
      }
    });
    return () => {
      sub.remove();
      authListener.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, [router]);
  return (
    <>
      <StatusBar barStyle="dark-content" />
      <NetworkProvider>
        <NotificationProvider>
          <SyncManager />
          <OfflineModal />
          <KeyboardProvider>
          {/* Wraps the whole app so the tour overlay can dim/spotlight any
           * screen, including the tab bar. */}
          <TutorialCoachProvider>
          {/* Transition language:
           *  - push (default): iOS-style slide for drilling into detail.
           *  - fade: context switches (auth ↔ app, boot, camera/analyzing),
           *    where a lateral slide would imply a "back" that isn't there.
           *  - fade_from_bottom: results that are "presented" to the user. */}
          <Stack
            screenOptions={{
              animation: "ios_from_right",
              headerShown: false,
            }}
          >
            <Stack.Screen name="index" options={{ animation: "fade" }} />
            <Stack.Screen name="welcome" options={{ animation: "fade" }} />
            <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
            <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
            <Stack.Screen name="doctor" options={{ animation: "fade" }} />
            <Stack.Screen name="(modules)/camera" options={{ animation: "fade" }} />
            <Stack.Screen name="(modules)/analyzing" options={{ animation: "fade" }} />
            <Stack.Screen
              name="(modules)/scan-results"
              options={{ animation: "fade_from_bottom" }}
            />
            <Stack.Screen
              name="(modules)/face-mismatch"
              options={{ animation: "fade_from_bottom" }}
            />
            <Stack.Screen name="(user-setup)/loading" options={{ animation: "fade" }} />
            <Stack.Screen
              name="(user-setup)/results"
              options={{ animation: "fade_from_bottom" }}
            />
          </Stack>
          </TutorialCoachProvider>
          </KeyboardProvider>
        </NotificationProvider>
      </NetworkProvider>
    </>
  );
}

export default SENTRY_DSN ? Sentry.wrap(RootLayout) : RootLayout;
