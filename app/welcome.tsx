import { useState } from "react";
import { View, Image } from "react-native";
import { Text } from "@/components/Text";
import { LinearGradient } from "expo-linear-gradient";

import Login from "@/components/Login";
import Register from "@/components/Register";
import { KeyboardAvoidingWrapper } from "@/components/KeyboardAwareView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { theme } from "@/lib/theme";
import Animated from "react-native-reanimated";
import { enterUp, fadeIn, popIn, PressableScale } from "@/components/motion";

function AuthTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  if (active) {
    return (
      <PressableScale
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: true }}
        className="flex-1 rounded-full"
        style={{ borderRadius: 999, overflow: "hidden" }}
      >
        <LinearGradient
          colors={[...theme.gradients.dark]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          className="py-3"
        >
          <Text className="text-center font-bold text-[14px] text-white">
            {label}
          </Text>
        </LinearGradient>
      </PressableScale>
    );
  }
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: false }}
      className="flex-1 py-3 rounded-full"
      style={{ backgroundColor: theme.colors.background }}
    >
      <Text
        className="text-center font-bold text-[14px]"
        style={{ color: theme.colors.muted }}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export default function Welcome() {
  const [selected, setSelect] = useState("login");
  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.card }}>
      <View className="items-center">
        <Animated.View entering={popIn}>
        <LinearGradient
          colors={[...theme.gradients.dark]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          className="w-20 h-20 mt-8 items-center justify-center overflow-hidden"
          style={{ borderRadius: theme.radius.card }}
        >
          <Image
            source={require("@/assets/images/skinlens-icon.png")}
            className="w-20 h-20"
          />
        </LinearGradient>
        </Animated.View>
        <Animated.View entering={enterUp(2)} className="items-center">
          <Text className="text-[24px] font-bold text-center mt-5" style={{ color: theme.colors.ink }}>
            Welcome to SkinLens
          </Text>
          <Text className="text-center text-[14px] mt-2 px-8 leading-6" style={{ color: theme.colors.muted }}>
            Track your skin health and routines
          </Text>
        </Animated.View>
      </View>
      <KeyboardAvoidingWrapper>
      <Animated.View entering={enterUp(3)} className="flex-row items-center mt-6 px-5 gap-2">
        <AuthTab
          label="Login"
          active={selected === "login"}
          onPress={() => setSelect("login")}
        />
        <AuthTab
          label="Sign Up"
          active={selected === "signup"}
          onPress={() => setSelect("signup")}
        />
      </Animated.View>
      <View
        className="flex-1 mt-4"
        style={{
          backgroundColor: theme.colors.background,
          borderTopLeftRadius: theme.radius.card,
          borderTopRightRadius: theme.radius.card,
          overflow: "hidden",
        }}
      >
        <ScreenGradient />
        {/* Keyed so switching Login ↔ Sign Up cross-fades the form. */}
        <Animated.View key={selected} entering={fadeIn} className="flex-1">
          {selected === "login" ? <Login /> : <Register />}
        </Animated.View>
      </View>
      </KeyboardAvoidingWrapper>
    </SafeAreaView>
  );
}
