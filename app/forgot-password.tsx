import { useState } from "react";
import { Text, TextInput, ToastAndroid, View } from "react-native";
import { Mail } from "lucide-react-native";
import { useRouter } from "expo-router";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import { sendResetEmail } from "@/utils/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const handleResetEmail = async () => {
    setLoading(true);
    try {
      await sendResetEmail(email);
      ToastAndroid.show(
        "Email has been sent. Please check in your mailbox.",
        ToastAndroid.SHORT,
      );
    } catch {
      ToastAndroid.show(
        "Something went wrong. Please try again.",
        ToastAndroid.SHORT,
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: 20 }}>
      <View className="flex-col">
        <Text className="text-[24px] font-bold text-center mt-4" style={{ color: "#10241A" }}>
          Forgot Password
        </Text>
        <Text className="text-center mt-2" style={{ color: "#6B7280" }}>
          Enter your email account to reset password
        </Text>
        <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2 mt-6" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}>
          <Mail size={22} color={theme.colors.faint} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email address"
            className="flex-1"
            style={{ color: theme.colors.ink }}
            placeholderTextColor={theme.colors.faint}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        <View className="mt-4 flex-col gap-2">
          <PrimaryButton
            label={loading ? "Please wait…" : "Continue"}
            onPress={handleResetEmail}
            disabled={loading}
          />
          <SecondaryButton label="Cancel" onPress={() => router.back()} />
        </View>
      </View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
