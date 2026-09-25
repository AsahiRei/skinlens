import { Text, View } from "react-native";
import { CloudOff } from "lucide-react-native";

import { useNetwork } from "@/hooks/useNetwork";

export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetwork();
  const offline = isConnected === false || isInternetReachable === false;

  if (!offline) return null;

  return (
    <View className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex-row items-center justify-center gap-2">
      <CloudOff size={16} color="#92400E" />
      <Text className="text-amber-900 text-xs font-semibold">
        {"You're offline. Changes will sync when connected."}
      </Text>
    </View>
  );
}
