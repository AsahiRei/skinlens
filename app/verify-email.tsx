import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, TextInput, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { FadeItem } from "@/components/FadeItem";
import { PrimaryButton, ScreenHeader, SecondaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import { completeSignup, resendSignupCode, verifySignupCode } from "@/lib/db/signup";
import { friendlyError } from "@/lib/db/pg-errors";
import { EMAIL_OTP_LENGTH, emailOtpSchema, firstError } from "@/lib/validation";

/** Supabase rate-limits resends to one per 60s per address by default. */
const RESEND_COOLDOWN_S = 60;

/**
 * Step 2 of email sign-up: the account exists but can't sign in until the user enters the code
 * Supabase emailed to them. Reached from Register (fresh sign-up) and Login (unverified account).
 */
export default function VerifyEmail() {
  const router = useRouter();
  const { email = "", sent } = useLocalSearchParams<{ email?: string; sent?: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(sent === "0" ? 0 : RESEND_COOLDOWN_S);

  useEffect(() => {
    if (!email) router.replace("/welcome");
  }, [email, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = useCallback(async () => {
    setError(null);
    const parsed = emailOtpSchema.safeParse(code);
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setVerifying(true);
    try {
      const user = await verifySignupCode(email, parsed.data);
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} email verified user=`, user.id);
      const result = await completeSignup(user);
      if (result.kind === "doctor") {
        ToastAndroid.show(`Doctor account linked to ${result.clinicName}!`, ToastAndroid.LONG);
      } else if (result.kind === "doctor-pending") {
        ToastAndroid.show(
          friendlyError(result.error, "Couldn't link your hospital yet."),
          ToastAndroid.LONG,
        );
        router.replace("/doctor-setup");
        return;
      } else {
        ToastAndroid.show("Email verified — account created!", ToastAndroid.SHORT);
      }
      router.replace("/");
    } catch (err) {
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} verify failed:`, err);
      setError(friendlyError(err, "Couldn't verify your email. Please try again."));
    } finally {
      setVerifying(false);
    }
  }, [code, email, router]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0) return;
    setError(null);
    setCooldown(RESEND_COOLDOWN_S);
    try {
      await resendSignupCode(email);
      ToastAndroid.show("A new code is on its way.", ToastAndroid.SHORT);
    } catch (err) {
      setError(friendlyError(err, "Couldn't resend the code. Please try again."));
    }
  }, [cooldown, email]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <KeyboardAwareScroll contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 40 }}>
        <View className="flex-col gap-4">
          <FadeItem index={0} distance={8} className="items-center mt-2">
            <Image
              source={require("@/assets/images/others/9.png")}
              style={{ height: 280, aspectRatio: 768 / 1376 }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </FadeItem>
          <FadeItem index={1}>
            <ScreenHeader
              title="Verify your email"
              subtitle={`We sent a ${EMAIL_OTP_LENGTH}-digit code to ${email}. Enter it below to activate your account.`}
            />
          </FadeItem>
          <FadeItem index={2}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, EMAIL_OTP_LENGTH))}
              placeholder={"•".repeat(EMAIL_OTP_LENGTH)}
              placeholderTextColor={theme.colors.faint}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={EMAIL_OTP_LENGTH}
              autoFocus
              accessibilityLabel="Verification code"
              // textAlign lives in `style`, not a `text-center` class: react-native-css maps
              // TextInput's textAlign with a boolean path and crashes ("undefined is not a function").
              className="bg-white px-4 py-4"
              style={{
                textAlign: "center",
                color: theme.colors.ink,
                fontSize: 24,
                letterSpacing: 6,
                borderWidth: 1,
                borderColor: error ? "#DC2626" : theme.colors.cardBorder,
                borderRadius: theme.radius.input,
              }}
            />
            {error ? (
              <Text className="text-xs mt-2" style={{ color: "#DC2626" }}>
                {error}
              </Text>
            ) : null}
          </FadeItem>
          <FadeItem index={3} className="flex-col gap-2">
            <PrimaryButton label="Verify" onPress={handleVerify} loading={verifying} />
            <Pressable
              onPress={handleResend}
              disabled={cooldown > 0}
              accessibilityRole="button"
              className="py-3 items-center active:opacity-60"
            >
              <Text
                className="text-sm font-medium"
                style={{ color: cooldown > 0 ? theme.colors.muted : theme.colors.primary }}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </Text>
            </Pressable>
            <SecondaryButton
              label="Use a different email"
              onPress={() => router.replace("/welcome")}
            />
          </FadeItem>
        </View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
