import { useEffect, useRef } from "react";
import { AppState, StatusBar } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Linking from "expo-linking";

import { NetworkProvider } from "@/hooks/useNetwork";
import { NotificationProvider } from "@/hooks/useNotifications";
import { SyncManager } from "@/components/SyncManager";
import { clearLocalUserData } from "@/lib/db/auth";
import { createSessionFromUrl, supabase } from "@/utils/supabase";
import { releaseLlama } from "@/utils/llama";

import "../global.css";

export default function RootLayout() {
  const router = useRouter();
  // Coalesces rapid duplicate SIGNED_OUT events (logout fires one per
  // signOut scope + one from validateSession's purge) into a single
  // redirect so navigation never loops.
  const lastSignOutRedirect = useRef(0);
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      createSessionFromUrl(url).catch((err) => {
        console.warn("Failed to create session from URL:", err);
      });
    });
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          createSessionFromUrl(url).catch((err) => {
            console.warn("Failed to create session from URL:", err);
          });
        }
      })
      .catch(() => {
        // No initial URL (cold start without a deep link) — nothing to do.
      });
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
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
          <Stack
            screenOptions={{
              animation: "ios_from_right",
              headerShown: false,
            }}
          />
        </NotificationProvider>
      </NetworkProvider>
    </>
  );
}
