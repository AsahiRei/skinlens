import { useEffect, useRef } from "react";

import { useNetwork } from "@/hooks/useNetwork";
import { processSyncQueue } from "@/lib/db/sync";

export function SyncManager() {
  const { isConnected, isInternetReachable } = useNetwork();
  const wasOffline = useRef(false);

  useEffect(() => {
    const online = isConnected && isInternetReachable !== false;

    if (online && wasOffline.current) {
      // Just came back online — process queue
      processSyncQueue().catch((err) =>
        console.error("Sync queue processing failed:", err),
      );
    }

    wasOffline.current = !online;
  }, [isConnected, isInternetReachable]);

  return null;
}
