import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";

import { useNetwork } from "@/hooks/useNetwork";
import { clearLocalUserData } from "@/lib/db/auth";
import { processSyncQueue } from "@/lib/db/sync";
import { supabase, validateSession } from "@/utils/supabase";

// Re-verifies the cached session against the server before draining the
// queue. Returns false when the account is gone (session purged, local rows
// wiped, routed to /welcome) so callers skip the sync.
async function validateBeforeSync(
  replace: ReturnType<typeof useRouter>["replace"],
): Promise<boolean> {
  console.log(`[SkinLens][Sync] ${new Date().toISOString()} validateBeforeSync start`);
  const {
    data: { session: cached },
  } = await supabase.auth.getSession();
  if (!cached) {
    console.log(`[SkinLens][Sync] ${new Date().toISOString()} no cached session, skip sync`);
    return false;
  }
  const valid = await validateSession();
  console.log(`[SkinLens][Sync] ${new Date().toISOString()} session valid=`, !!valid);
  if (!valid) {
    // validateSession() already purged the AsyncStorage session (which
    // emits SIGNED_OUT → _layout clears + redirects), so only the SQLite
    // rows remain to be wiped here. No signOut call — that would re-emit
    // SIGNED_OUT and loop. replace (not push) so repeated triggers can't
    // stack /welcome screens.
    await clearLocalUserData();
    try {
      replace("/welcome");
    } catch {}
    return false;
  }
  return true;
}

export function SyncManager() {
  const { isConnected, isInternetReachable } = useNetwork();
  const wasOffline = useRef(false);
  const router = useRouter();

  useEffect(() => {
    console.log(`[SkinLens][Sync] ${new Date().toISOString()} SyncManager mount, initial sync`);
    validateBeforeSync(router.replace)
      .then((ok) => {
        console.log(`[SkinLens][Sync] ${new Date().toISOString()} initial sync ok=`, ok);
        if (ok) return processSyncQueue();
      })
      .catch((err) => {
        console.log(`[SkinLens][Sync] ${new Date().toISOString()} initial sync failed:`, err);
        console.error("Initial sync queue processing failed:", err);
      });
  }, [router]);

  useEffect(() => {
    const online = isConnected && isInternetReachable !== false;

    if (online && wasOffline.current) {
      console.log(`[SkinLens][Sync] ${new Date().toISOString()} back online, re-validating`);
      // Offline → online transition: the account may have been deleted
      // while we were away. Validate first so a stale AsyncStorage session
      // can't keep syncing or keep the user inside (tabs).
      validateBeforeSync(router.replace)
        .then((ok) => {
          console.log(`[SkinLens][Sync] ${new Date().toISOString()} reconnect sync ok=`, ok);
          if (ok) return processSyncQueue();
        })
        .catch((err) => {
          console.log(`[SkinLens][Sync] ${new Date().toISOString()} reconnect sync failed:`, err);
          console.error("Sync queue processing failed:", err);
        });
    }

    wasOffline.current = !online;
  }, [isConnected, isInternetReachable, router]);

  // Foreground re-validation: app was backgrounded (possibly for days) —
  // the server-side account may be gone even without a NetInfo flap.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      validateBeforeSync(router.replace)
        .then((ok) => {
          if (ok) return processSyncQueue();
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [router]);

  return null;
}
