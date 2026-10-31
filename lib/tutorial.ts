import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * First-run tutorial state — device-only and keyed per account.
 *
 * The flag answers "has the guided tour on THIS device been finished for
 * this account?", so it lives in AsyncStorage instead of SQLite/sync: a
 * second account signed in on the same phone still gets the tour, and the
 * server never needs to know about it.
 *
 * Flow: results.tsx arms it right after setup completes, the coach tour
 * (components/TutorialCoach.tsx) clears it on finish/skip, and the boot
 * router in app/index.tsx checks it so killing the app mid-tour replays the
 * tour on next launch.
 */
const TUTORIAL_PENDING_KEY = "tutorial_pending:";

export function tutorialPendingKey(userId: string): string {
  return `${TUTORIAL_PENDING_KEY}${userId}`;
}

/** Arm the tour for this account (called when first-time setup completes). */
export async function setTutorialPending(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(tutorialPendingKey(userId), "true");
  } catch (err) {
    // AsyncStorage unavailable — the current run still shows the tour; only
    // the replay-on-restart behavior is lost.
    console.warn("[tutorial] failed to arm pending flag:", err);
  }
}

/** True while the tour still needs to be shown on this device. Fails open. */
export async function isTutorialPending(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(tutorialPendingKey(userId))) === "true";
  } catch {
    // Unreadable storage must never trap the user behind a gate that cannot
    // be evaluated — fall through to the tabs.
    return false;
  }
}

/** Tour finished or skipped — never show it again for this account. */
export async function clearTutorialPending(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(tutorialPendingKey(userId));
  } catch (err) {
    console.warn("[tutorial] failed to clear pending flag:", err);
  }
}
