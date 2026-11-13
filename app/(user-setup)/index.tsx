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
          Let’s set up your skin profile
        </Text>
        <Text className="mt-3 text-center leading-5" style={{ color: theme.colors.muted }}>
          Scan your face, then answer a few quick questions. We use both to build a routine that
          fits your skin.
        </Text>
        <View className="w-full mt-4">
          <PrimaryButton
            label="Start Skin Scan"
            onPress={() =>
              router.push({ pathname: "/(user-setup)/face-enroll", params: { skipIntro: "1" } })
            }
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
