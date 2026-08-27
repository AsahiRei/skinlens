import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useNetwork } from "@/hooks/useNetwork";

export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetwork();
  const offline = isConnected === false || isInternetReachable === false;

  if (!offline) return null;

  return (
    <View className="bg-green-500 px-4 py-2 flex-row items-center justify-center gap-2">
      <Ionicons name="cloud-offline-outline" size={16} color="white" />
      <Text className="text-white text-xs font-semibold">
        You're offline. Changes will sync when connected.
      </Text>
    </View>
  );
}
