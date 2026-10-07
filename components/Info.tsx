import { Text, View } from "react-native";

import { theme } from "@/lib/theme";
import Skeleton from "./Skeleton";

export function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View
      className="flex-1 rounded-2xl px-4 py-3"
      style={{ backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.input }}
    >
      <Text className="text-sm mb-1" style={{ color: theme.colors.muted }}>{label}</Text>
      <Text className="font-bold text-base" style={{ color: theme.colors.primaryDeep }}>{value}</Text>
    </View>
  );
}

export function InfoCardSkeleton() {
  return (
    <View
      className="flex-1 rounded-2xl px-4 py-3 gap-2"
      style={{ backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.input }}
    >
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-4 w-20" />
    </View>
  );
}
