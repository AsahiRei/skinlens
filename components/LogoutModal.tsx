import { useState } from "react";
import { ToastAndroid } from "react-native";
import { useRouter } from "expo-router";

import { UiModal } from "@/components/ui";
import { supabase } from "@/utils/supabase";
import { clearLocalUserData } from "@/lib/db/auth";
import { processSyncQueue } from "@/lib/db/sync";
import { countPendingSync } from "@/lib/db/sync-queue";
import { isOnlineNow } from "@/utils/network";

// Upper bound on how long logout waits for pending writes (e.g. scan photos still waiting to
// upload) to reach the server before the local copy is wiped.
const LOGOUT_SYNC_TIMEOUT_MS = 15000;

type LogoutModalProps = {
  isVisible: boolean;
  setVisible: (v: boolean) => void;
};

export default function LogoutModal({ isVisible, setVisible }: LogoutModalProps) {
  const [loading, setLoading] = useState(false);
  // Set once the user has been told that logging out now drops unsynced data.
  const [unsyncedWarning, setUnsyncedWarning] = useState<string | null>(null);
  const router = useRouter();
  const close = () => {
    if (loading) return;
    setUnsyncedWarning(null);
    setVisible(false);
  };
  const logout = async () => {
    setLoading(true);
    // clearLocalUserData deletes the sync queue, so anything not yet pushed (scans saved offline or
    // whose photo upload failed) would be lost for good. Flush it while the session is still valid.
    if (!unsyncedWarning) {
      try {
        if (await isOnlineNow()) {
          await Promise.race([
            processSyncQueue(),
            new Promise((resolve) => setTimeout(resolve, LOGOUT_SYNC_TIMEOUT_MS)),
          ]);
        }
        const pending = await countPendingSync();
        if (pending > 0) {
          // Offline (or the flush failed): ask before throwing those changes away.
          setUnsyncedWarning(
            `${pending} change${pending === 1 ? "" : "s"} (like scans and their photos) haven't synced yet and will be lost if you log out now. Connect to the internet and try again to keep them.`,
          );
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn("[logout] pre-logout sync failed:", err);
      }
    }
    try {
      // Global sign-out revokes the server session, but it fails offline (or when the account was
      // already deleted). Fall back to local scope so the user is never stuck logged in.
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await clearLocalUserData();
      setVisible(false);
      router.replace("/welcome");
    } catch (err) {
      console.error("Sign-out failed, falling back to local:", err);
      try {
        await supabase.auth.signOut({ scope: "local" });
        await clearLocalUserData();
        setVisible(false);
        router.replace("/welcome");
      } catch (fallbackErr) {
        // Keep the modal open and surface the failure — the session persists.
        console.error("Local sign-out failed:", fallbackErr);
        ToastAndroid.show("Couldn't log out. Please try again.", ToastAndroid.SHORT);
      }
    } finally {
      setUnsyncedWarning(null);
      setLoading(false);
    }
  };
  return (
    <UiModal
      visible={isVisible}
      onDismiss={close}
      title={unsyncedWarning ? "Unsynced data" : "Log out?"}
      message={unsyncedWarning ?? "Are you sure you want to log out of SkinLens?"}
      dismissOnBackdrop={!loading}
      actions={[
        {
          label: unsyncedWarning ? "Log out anyway" : "Log out",
          kind: "danger",
          loading,
          onPress: () => void logout(),
        },
        { label: "Stay logged in", kind: "secondary", onPress: close },
      ]}
    />
  );
}
