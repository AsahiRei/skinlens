import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { router } from "expo-router";

import { useNetwork } from "@/hooks/useNetwork";
import { clearLocalUserData } from "@/lib/db/auth";
import { processSyncQueue } from "@/lib/db/sync";
import { supabase, validateSession } from "@/utils/supabase";

// Foreground resumes within this window of the last completed pass skip the
// validate + drain round trip (quick app switches would otherwise fire a
// getUser() call every time).
const FOREGROUND_RESYNC_MIN_INTERVAL_MS = 60_000;

// Re-verifies the cached session against the server before draining the
// queue. Returns false when the account is gone (session purged, local rows
// wiped, routed to /welcome) so callers skip the sync.
async function validateBeforeSync(): Promise<boolean> {
  if (__DEV__) console.log(`[SkinLens][Sync] ${new Date().toISOString()} validateBeforeSync start`);
  const {
    data: { session: cached },
  } = await supabase.auth.getSession();
  if (!cached) {
    if (__DEV__) console.log(`[SkinLens][Sync] ${new Date().toISOString()} no cached session, skip sync`);
    return false;
  }
  const valid = await validateSession();
  if (__DEV__) console.log(`[SkinLens][Sync] ${new Date().toISOString()} session valid=`, !!valid);
  if (!valid) {
    // validateSession() already purged the AsyncStorage session (which
    // emits SIGNED_OUT → _layout clears + redirects), so only the SQLite
    // rows remain to be wiped here. No signOut call — that would re-emit
    // SIGNED_OUT and loop. replace (not push) so repeated triggers can't
    // stack /welcome screens.
    await clearLocalUserData();
    try {
      router.replace("/welcome");
    } catch {}
    return false;
  }
  return true;
}

async function isOnlineNow(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    // NetInfo unavailable — assume online and let the request decide.
    return true;
  }
}

// Mount, reconnect and foreground can all fire within the same second at
// boot; share one in-flight validate + drain instead of issuing a getUser()
// round trip for each. Module-level: there is a single SyncManager.
let inFlight: Promise<void> | null = null;
let lastSyncAt = 0;
// A reconnect that lands mid-pass may mean that pass ran (and failed
// entries) on the dead link — queue exactly one follow-up pass for it.
let rerunAfter = false;

function runSync(reason: string): Promise<void> {
  if (inFlight) {
    if (reason === "reconnect") rerunAfter = true;
    return inFlight;
  }
  inFlight = (async () => {
    // Offline: validateSession() would only wait out the fetch timeout and
    // the drain would fail every entry. The reconnect transition triggers
    // the pass once connectivity returns.
    if (!(await isOnlineNow())) {
      if (__DEV__) console.log(`[SkinLens][Sync] ${new Date().toISOString()} ${reason}: offline, skip`);
      return;
    }
    const ok = await validateBeforeSync();
    if (__DEV__) console.log(`[SkinLens][Sync] ${new Date().toISOString()} ${reason} sync ok=`, ok);
    if (ok) await processSyncQueue({ sessionValidated: true });
    lastSyncAt = Date.now();
  })()
    .catch((err) => {
      console.error(`Sync queue processing failed (${reason}):`, err);
    })
    .finally(() => {
      inFlight = null;
      if (rerunAfter) {
        rerunAfter = false;
        void runSync("reconnect");
      }
    });
  return inFlight;
}

export function SyncManager() {
  const { isConnected, isInternetReachable } = useNetwork();
  const wasOffline = useRef(false);

  useEffect(() => {
    void runSync("initial");
  }, []);

  useEffect(() => {
    const online = isConnected && isInternetReachable !== false;

    if (online && wasOffline.current) {
      // Offline → online transition: the account may have been deleted
      // while we were away. Validate first so a stale AsyncStorage session
      // can't keep syncing or keep the user inside (tabs).
      void runSync("reconnect");
    }

    wasOffline.current = !online;
  }, [isConnected, isInternetReachable]);

  // Foreground re-validation: app was backgrounded (possibly for days) —
  // the server-side account may be gone even without a NetInfo flap.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (Date.now() - lastSyncAt < FOREGROUND_RESYNC_MIN_INTERVAL_MS) return;
      void runSync("foreground");
    });
    return () => sub.remove();
  }, []);

  return null;
}
