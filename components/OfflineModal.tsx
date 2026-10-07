import { useState } from "react";
import { CloudOff } from "lucide-react-native";

import { UiModal } from "@/components/ui";
import { useNetwork } from "@/hooks/useNetwork";

/**
 * Reminds the user once per offline episode that they're in offline mode.
 * Dismissing won't re-popup until the next offline transition — reconnecting
 * resets the flag so a fresh outage reminds again.
 */
export function OfflineModal() {
  const { isConnected, isInternetReachable } = useNetwork();
  const offline = isConnected === false || isInternetReachable === false;
  const [dismissed, setDismissed] = useState(false);
  // Reset the dismissal when connectivity flips (store-previous-value
  // pattern — no effect needed, reconnecting re-arms the next reminder).
  const [prevOffline, setPrevOffline] = useState(offline);
  if (prevOffline !== offline) {
    setPrevOffline(offline);
    if (!offline) setDismissed(false);
  }

  return (
    <UiModal
      visible={offline && !dismissed}
      onDismiss={() => setDismissed(true)}
      title="You're offline"
      message="You are in offline mode. Changes you make will be saved on this device and synced when you reconnect."
      icon={CloudOff}
      tone="warning"
      actions={[
        { label: "Continue offline", onPress: () => setDismissed(true) },
      ]}
    />
  );
}
