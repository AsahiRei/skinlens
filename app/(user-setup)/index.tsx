import { View, Image } from "react-native";
import { Text } from "@/components/Text";
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
        <Image
          source={require("@/assets/images/others/3.png")}
          style={{ width: 400, height: 400 }}
          resizeMode="contain"
        />
        <Text className="text-[28px] font-bold text-center" style={{ color: theme.colors.ink }}>
          Let’s get to know your skin
        </Text>
        <Text className="mt-3 text-center" style={{ color: theme.colors.muted }}>
          Answer a few quick questions to set up your routine.
        </Text>
        <View className="w-full mt-4">
          <PrimaryButton label="Continue" onPress={() => router.push("/(user-setup)/setup")} />
        </View>
      </View>
    </SafeAreaView>
  );
}
