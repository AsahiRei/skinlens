import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { PrimaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";

export default function Index() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
    <View className="flex-1 items-center justify-center p-6">
      <Text className="text-[28px] font-bold text-center" style={{ color: "#10241A" }}>
        Let’s get to know your skin
      </Text>
      <Text className="mt-3 text-center" style={{ color: "#6B7280" }}>
        Answer a few quick questions to set up your routine.
      </Text>
      <View className="w-full mt-4">
        <PrimaryButton
          label="Continue"
          onPress={() => router.push("/(user-setup)/setup")}
        />
      </View>
    </View>
    </SafeAreaView>
  );
}
