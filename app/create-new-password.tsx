import { useState } from "react";
import { Image, Pressable, TextInput, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { Lock, Eye, EyeOff } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import { FadeItem } from "@/components/FadeItem";
import { supabase, updatePassword } from "@/utils/supabase";
import { firstError, newPasswordSchema } from "@/lib/validation";

export default function CreateNewPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const handleUpdatePassword = async () => {
    const parsed = newPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      ToastAndroid.show(firstError(parsed.error), ToastAndroid.SHORT);
      return;
    }
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} create-new-password submit`);
    setLoading(true);
    try {
      await updatePassword(password);
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} password updated, signing out`);
      await supabase.auth.signOut();
      ToastAndroid.show("Change password successfully!", ToastAndroid.SHORT);
      router.replace("/welcome");
    } catch (err) {
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} create-new-password failed:`, err);
      ToastAndroid.show("Something went wrong. Please try again.", ToastAndroid.SHORT);
    } finally {
      setLoading(false);
    }
  };
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: 20 }}>
        <View className="flex-col">
          <FadeItem index={0} distance={8}>
            <Image
              source={require("@/assets/images/others/2.png")}
              style={{ width: 400, height: 400 }}
              resizeMode="contain"
              className="self-center"
            />
          </FadeItem>
          <FadeItem index={2}>
            <Text className="text-[24px] font-bold text-center mt-4" style={{ color: "#10241A" }}>
              New Password
            </Text>
            <Text className="text-center mt-2" style={{ color: "#6B7280" }}>
              Enter a new password for your account
            </Text>
          </FadeItem>
          <FadeItem index={3} className="flex-col gap-4 mt-6">
            <View
              className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2"
              style={{ borderWidth: 1, borderColor: "#E5EDE8" }}
            >
              <Lock size={22} color={theme.colors.muted} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                className="flex-1 text-[#10241A]"
                placeholderTextColor={theme.colors.faint}
                secureTextEntry={!showPassword}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                className="active:opacity-60"
              >
                {showPassword ? (
                  <EyeOff size={22} color={theme.colors.muted} />
                ) : (
                  <Eye size={22} color={theme.colors.muted} />
                )}
              </Pressable>
            </View>
            <View
              className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2"
              style={{ borderWidth: 1, borderColor: "#E5EDE8" }}
            >
              <Lock size={22} color={theme.colors.muted} />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                className="flex-1 text-[#10241A]"
                placeholderTextColor={theme.colors.faint}
                secureTextEntry={!showConfirmPassword}
              />
              <Pressable
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                className="active:opacity-60"
              >
                {showConfirmPassword ? (
                  <EyeOff size={22} color={theme.colors.muted} />
                ) : (
                  <Eye size={22} color={theme.colors.muted} />
                )}
              </Pressable>
            </View>
          </FadeItem>
          <FadeItem index={4} className="mt-4 flex-col gap-2">
            <PrimaryButton
              label="Change Password"
              onPress={handleUpdatePassword}
              loading={loading}
            />
            <SecondaryButton
              label="Cancel"
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))}
            />
          </FadeItem>
        </View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
