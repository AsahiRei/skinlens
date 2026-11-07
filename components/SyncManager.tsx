import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";

import { useNetwork } from "@/hooks/useNetwork";
import { clearLocalUserData } from "@/lib/db/auth";
import { processSyncQueue } from "@/lib/db/sync";
import { countPendingSync } from "@/lib/db/sync-queue";
import { isOnlineNow } from "@/utils/network";
import { supabase, validateSession } from "@/utils/supabase";

// Foreground resumes within this window of the last completed pass skip the validate + drain round
// trip (quick app switches would otherwise fire a getUser() call every time).
const FOREGROUND_RESYNC_MIN_INTERVAL_MS = 60_000;

// While online with entries still queued (photo upload failed, transient server error), retry with
// backoff instead of waiting for the next reconnect / foreground, which may never come.
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 10 * 60_000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = RETRY_BASE_MS;

function clearRetry(resetBackoff: boolean): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (resetBackoff) retryDelay = RETRY_BASE_MS;
}

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void runSync("retry");
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}

// Re-verifies the cached session against the server before draining the queue.
async function validateBeforeSync(): Promise<boolean> {
  if (__DEV__) console.log(`[SkinLens][Sync] ${new Date().toISOString()} validateBeforeSync start`);
  const {
    data: { session: cached },
  } = await supabase.auth.getSession();
  if (!cached) {
    if (__DEV__)
      console.log(`[SkinLens][Sync] ${new Date().toISOString()} no cached session, skip sync`);
    return false;
  }
  const valid = await validateSession();
  if (__DEV__) console.log(`[SkinLens][Sync] ${new Date().toISOString()} session valid=`, !!valid);
  if (!valid) {
    // validateSession() already purged the AsyncStorage session (which emits SIGNED_OUT → _layout
    // clears + redirects), so only the SQLite rows remain to be wiped here.
    await clearLocalUserData();
    try {
      router.replace("/welcome");
    } catch {}
    return false;
  }
  return true;
}

// Mount, reconnect and foreground can all fire within the same second at boot; share one in-flight
// validate + drain instead of issuing a getUser() round trip for each.
let inFlight: Promise<void> | null = null;
let lastSyncAt = 0;
// A reconnect that lands mid-pass may mean that pass ran (and failed entries) on the dead link, and a
// request mid-pass means a new entry the running pass's snapshot doesn't include — queue exactly one
// follow-up pass for either.
let rerunAfter: string | null = null;

function runSync(reason: string): Promise<void> {
  if (inFlight) {
    if (reason === "reconnect" || reason === "request") rerunAfter = reason;
    return inFlight;
  }
  inFlight = (async () => {
    // Offline: validateSession() would only wait out the fetch timeout and the drain would fail
    // every entry.
    if (!(await isOnlineNow())) {
      if (__DEV__)
        console.log(`[SkinLens][Sync] ${new Date().toISOString()} ${reason}: offline, skip`);
      return;
    }
    const ok = await validateBeforeSync();
    if (__DEV__) console.log(`[SkinLens][Sync] ${new Date().toISOString()} ${reason} sync ok=`, ok);
    if (!ok) {
      clearRetry(true);
      return;
    }
    await processSyncQueue({ sessionValidated: true });
    lastSyncAt = Date.now();
    if ((await countPendingSync()) > 0) {
      scheduleRetry();
    } else {
      clearRetry(true);
    }
  })()
    .catch((err) => {
      console.error(`Sync queue processing failed (${reason}):`, err);
    })
    .finally(() => {
      inFlight = null;
      if (rerunAfter) {
        const again = rerunAfter;
        rerunAfter = null;
        void runSync(again);
      }
    });
  return inFlight;
}

/**
 * Asks for a sync pass soon (e.g. right after a scan was saved with its photo still queued), sharing
 * the in-flight pass if one is running. No-op offline — the reconnect listener picks it up.
 */
export function requestSync(): void {
  void runSync("request");
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
      // Offline → online transition: the account may have been deleted while we were away. Flush
      // right away with a fresh backoff instead of waiting on a retry timer from before the outage.
      clearRetry(true);
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
