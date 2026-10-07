import { useState } from "react";
import { Pressable, Text, View, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import Login from "@/components/Login";
import Register from "@/components/Register";
import { KeyboardAvoidingWrapper } from "@/components/KeyboardAwareView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { theme } from "@/lib/theme";

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
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: true }}
        className="flex-1 rounded-full active:opacity-80"
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
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: false }}
      className="flex-1 py-3 rounded-full active:opacity-80"
      style={{ backgroundColor: theme.colors.background }}
    >
      <Text
        className="text-center font-bold text-[14px]"
        style={{ color: theme.colors.muted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function Welcome() {
  const [selected, setSelect] = useState("login");
  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.card }}>
      <View className="items-center">
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
        <Text className="text-[24px] font-bold text-center mt-5" style={{ color: theme.colors.ink }}>
          Welcome to SkinLens
        </Text>
        <Text className="text-center text-[14px] mt-2 px-8 leading-6" style={{ color: theme.colors.muted }}>
          Track your skin health and routines
        </Text>
      </View>
      <KeyboardAvoidingWrapper>
      <View className="flex-row items-center mt-6 px-5 gap-2">
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
      </View>
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
        {selected === "login" ? <Login /> : <Register />}
      </View>
      </KeyboardAvoidingWrapper>
    </SafeAreaView>
  );
}
