import { useState } from "react";
import { ToastAndroid } from "react-native";
import { useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";

import { UiModal } from "@/components/ui";
import { deleteMyAccount } from "@/lib/db/auth";
import { useNetwork } from "@/hooks/useNetwork";

type DeleteAccountModalProps = {
  isVisible: boolean;
  setVisible: (v: boolean) => void;
};

/**
 * Two-step confirmation for permanent account deletion. Required by Google
 * Play for apps with account creation, and promised by the Privacy Policy.
 */
export default function DeleteAccountModal({
  isVisible,
  setVisible,
}: DeleteAccountModalProps) {
  const router = useRouter();
  const { isConnected } = useNetwork();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const close = () => {
    if (loading) return;
    setConfirming(false);
    setVisible(false);
  };

  const remove = async () => {
    if (!isConnected) {
      ToastAndroid.show(
        "Connect to the internet to delete your account.",
        ToastAndroid.LONG,
      );
      return;
    }
    setLoading(true);
    try {
      await deleteMyAccount();
      setConfirming(false);
      setVisible(false);
      ToastAndroid.show("Your account was deleted.", ToastAndroid.LONG);
      router.replace("/welcome");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ToastAndroid.show(`Couldn't delete account: ${msg}`, ToastAndroid.LONG);
    } finally {
      setLoading(false);
    }
  };

  return (
    <UiModal
      visible={isVisible}
      onDismiss={close}
      title={confirming ? "This can't be undone" : "Delete account?"}
      message={
        confirming
          ? "Your profile, face enrollment, scan history, routines, appointments and reports will be permanently deleted."
          : "Deleting your account permanently removes all of your SkinLens data from our servers and this device."
      }
      icon={Trash2}
      tone="danger"
      dismissOnBackdrop={!loading}
      actions={[
        confirming
          ? {
              label: "Delete permanently",
              kind: "danger",
              loading,
              onPress: () => void remove(),
            }
          : {
              label: "Continue",
              kind: "danger",
              onPress: () => setConfirming(true),
            },
        { label: "Cancel", kind: "secondary", onPress: close },
      ]}
    />
  );
}
