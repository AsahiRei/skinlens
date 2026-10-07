import { useState } from "react";
import { ToastAndroid } from "react-native";
import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";

import { UiModal } from "@/components/ui";
import { supabase } from "@/utils/supabase";
import { clearLocalUserData } from "@/lib/db/auth";

type LogoutModalProps = {
  isVisible: boolean;
  setVisible: (v: boolean) => void;
};

export default function LogoutModal({
  isVisible,
  setVisible,
}: LogoutModalProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const close = () => {
    if (!loading) setVisible(false);
  };
  const logout = async () => {
    setLoading(true);
    try {
      // Global sign-out revokes the server session, but it fails offline
      // (or when the account was already deleted). Fall back to local
      // scope so the user is never stuck logged in.
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
        ToastAndroid.show(
          "Couldn't log out. Please try again.",
          ToastAndroid.SHORT,
        );
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <UiModal
      visible={isVisible}
      onDismiss={close}
      title="Log out?"
      message="Are you sure you want to log out of SkinLens?"
      icon={LogOut}
      tone="soft"
      dismissOnBackdrop={!loading}
      actions={[
        {
          label: "Log out",
          kind: "danger",
          loading,
          onPress: () => void logout(),
        },
        { label: "Stay logged in", kind: "secondary", onPress: close },
      ]}
    />
  );
}
