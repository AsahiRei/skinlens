<<<<<<< HEAD
import { Text, View } from "react-native";

=======
import { View, Text } from "react-native";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
import Skeleton from "./Skeleton";

export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-green-50 rounded-2xl px-4 py-3">
      <Text className="text-gray-600 text-sm mb-1">{label}</Text>
      <Text className="text-green-900 font-bold text-base">{value}</Text>
    </View>
  );
}

export function InfoCardSkeleton() {
  return (
    <View className="flex-1 bg-green-50 rounded-2xl px-4 py-3 gap-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-4 w-20" />
    </View>
  );
}
