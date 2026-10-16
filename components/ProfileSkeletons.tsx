import { View } from "react-native";

import { theme } from "@/lib/theme";
import Skeleton from "./Skeleton";

/**
 * Shared profile loading skeletons — the exact idioms from the user
 * account page, reused by the doctor account page so both loading
 * states look like family instead of being written twice.
 */

export function HeroTextSkeleton({ className = "mt-2" }: { className?: string }) {
  return (
    <View className={`gap-2 ${className}`}>
      <Skeleton className="h-7 w-40 rounded-lg" />
      <Skeleton className="h-4 w-44 mt-1 rounded-md" />
    </View>
  );
}

export function CardTitleSkeleton({ className = "" }: { className?: string }) {
  return <Skeleton className={`h-5 w-28 ${className}`} />;
}

export function IconRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          className="flex-row items-center py-3"
          style={{
            borderBottomWidth: i < rows - 1 ? 1 : 0,
            borderBottomColor: theme.colors.divider,
          }}
        >
          <Skeleton className="w-10 h-10 rounded-full mr-3" />
          <View className="flex-1 gap-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-32" />
          </View>
        </View>
      ))}
    </>
  );
}
