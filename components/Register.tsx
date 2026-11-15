import { useState } from "react";
import { Pressable, Platform, TextInput, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { User, Mail, Lock, Eye, EyeOff, Check, Stethoscope, Ticket } from "lucide-react-native";

import { theme } from "@/lib/theme";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import LegalModal from "@/components/LegalModal";
import { PrimaryButton } from "@/components/ui";
import { supabase } from "@/utils/supabase";
import { checkInviteCode } from "@/lib/db/appointments";
import { completeSignup } from "@/lib/db/signup";
import { friendlyError } from "@/lib/db/pg-errors";
import { firstError, getPasswordRules, registerSchema, stripDrPrefix } from "@/lib/validation";

function RuleItem({ label, met }: { label: string; met: boolean }) {
  return (
    <View
      className="flex-row items-center gap-2"
      accessible
      accessibilityLabel={`${label}: ${met ? "done" : "not yet"}`}
    >
      <View
        className="w-5 h-5 rounded-full items-center justify-center"
        style={
          met
            ? {
                backgroundColor: theme.colors.primary,
                borderWidth: 1.5,
                borderColor: theme.colors.primary,
              }
            : { backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: theme.colors.faint }
        }
      >
        {met && <Check size={12} color="white" strokeWidth={3} />}
      </View>
      <Text
        className="text-xs"
        style={{
          color: met ? theme.colors.primary : theme.colors.muted,
          fontWeight: met ? "600" : "400",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function Register() {
  const [displayName, setDisplayName] = useState("");
  const [isDoctor, setIsDoctor] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [legal, setLegal] = useState<null | "terms" | "privacy">(null);
  const router = useRouter();
  const passwordRules = getPasswordRules(password, confirmPassword);
  const handleRegister = async () => {
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleRegister start`);

    const parsed = registerSchema.safeParse({
      isDoctor,
      agreed,
      email,
      password,
      confirmPassword,
      displayName,
      inviteCode,
    });
    if (!parsed.success) {
      ToastAndroid.show(firstError(parsed.error), ToastAndroid.SHORT);
      return;
    }
    const input = parsed.data;
    const cleanName = input.isDoctor ? input.displayName : "";
    const cleanCode = input.isDoctor ? input.inviteCode : "";
    setLoading(true);
    try {
      // 0. Doctor path: validate the invite code BEFORE creating the auth account.
      if (isDoctor) {
        try {
          await checkInviteCode(cleanCode);
        } catch (checkErr) {
          console.log(
            `[SkinLens][Auth] ${new Date().toISOString()} invite pre-check failed:`,
            checkErr,
          );
          ToastAndroid.show(friendlyError(checkErr, "Invalid invite code."), ToastAndroid.LONG);
          return;
        }
      }
      // 1. Create Supabase authentication account.
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} signUp start`);
      const { data: authData, error: registerError } = await supabase.auth.signUp({
        email: input.email,
        password,
        options: isDoctor
          ? {
              data: {
                pending_invite_code: cleanCode,
                pending_display_name: cleanName,
              },
            }
          : undefined,
      });
      if (registerError) {
        console.log(
          `[SkinLens][Auth] ${new Date().toISOString()} signUp failed:`,
          registerError.message,
        );
        ToastAndroid.show(friendlyError(registerError, "Registration failed."), ToastAndroid.LONG);
        return;
      }
      const user = authData.user;
      console.log(
        `[SkinLens][Auth] ${new Date().toISOString()} signUp success user=`,
        user?.id ?? null,
        `session=`,
        !!authData.session,
      );
      if (!user) {
        ToastAndroid.show("Registration failed. Please try again.", ToastAndroid.SHORT);
        return;
      }
      // With email confirmation on, signing up an address that already has a confirmed account
      // returns an obfuscated user with no identities (and sends no email).
      if (!authData.session && user.identities?.length === 0) {
        ToastAndroid.show(
          "An account with this email already exists. Please sign in.",
          ToastAndroid.LONG,
        );
        return;
      }
      // 2. No session = the email must be verified first. The profile row and invite-code redeem
      // need a session (RLS), so they run on /verify-email once the code is entered.
      if (!authData.session) {
        router.push({ pathname: "/verify-email", params: { email: input.email } });
        return;
      }
      // 3. Session already issued (email confirmation disabled in the Supabase project):
      // create the profile + link the hospital right away.
      const result = await completeSignup(user);
      if (result.kind === "doctor-pending") {
        // The account already exists — keep it signed in and let the doctor retry with another
        // code instead of stranding it.
        ToastAndroid.show(
          friendlyError(result.error, "Couldn't link your hospital yet."),
          ToastAndroid.LONG,
        );
        router.replace("/doctor-setup");
        return;
      }
      ToastAndroid.show(
        result.kind === "doctor"
          ? `Doctor account linked to ${result.clinicName}!`
          : "Account created successfully!",
        result.kind === "doctor" ? ToastAndroid.LONG : ToastAndroid.SHORT,
      );
      // 4. Registration successful
      console.log(
        `[SkinLens][Auth] ${new Date().toISOString()} handleRegister success user=`,
        user.id,
      );
      router.replace("/");
    } catch (error) {
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleRegister exception:`, error);
      console.error("Registration error:", error);
      ToastAndroid.show("Something went wrong. Please try again.", ToastAndroid.SHORT);
    } finally {
      setLoading(false);
    }
  };
  return (
    <KeyboardAwareScroll contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 40 }}>
      <View className="flex-col gap-4">
        {isDoctor ? (
          <View className="flex-col gap-2">
            <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>
              Full Name
            </Text>
            <View
              className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2"
              style={{
                borderWidth: 1,
                borderColor: theme.colors.cardBorder,
                borderRadius: theme.radius.input,
              }}
            >
              <User size={22} color={theme.colors.muted} />
              <Text className="font-semibold" style={{ color: theme.colors.primary }}>
                Dr.
              </Text>
              <TextInput
                value={displayName}
                onChangeText={(t) => setDisplayName(stripDrPrefix(t))}
                placeholder="Jane Cruz"
                className="flex-1"
                style={{ color: theme.colors.ink }}
                placeholderTextColor={theme.colors.faint}
                autoCapitalize="words"
              />
            </View>
          </View>
        ) : null}
        <View className="flex-col gap-2">
          <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>
            Email Address
          </Text>
          <View
            className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2"
            style={{
              borderWidth: 1,
              borderColor: theme.colors.cardBorder,
              borderRadius: theme.radius.input,
            }}
          >
            <Mail size={22} color={theme.colors.muted} />
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
        </View>
        <View className="flex-col gap-2">
          <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>
            Password
          </Text>
          <View
            className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2"
            style={{
              borderWidth: 1,
              borderColor: theme.colors.cardBorder,
              borderRadius: theme.radius.input,
            }}
          >
            <Lock size={22} color={theme.colors.muted} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              className="flex-1"
              style={{ color: theme.colors.ink }}
              placeholderTextColor={theme.colors.faint}
              secureTextEntry={!showPassword}
            />

            <Pressable onPress={() => setShowPassword(!showPassword)} className="active:opacity-60">
              {showPassword ? (
                <EyeOff size={22} color={theme.colors.muted} />
              ) : (
                <Eye size={22} color={theme.colors.muted} />
              )}
            </Pressable>
          </View>
        </View>
        <View className="flex-col gap-2">
          <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>
            Confirm Password
          </Text>
          <View
            className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2"
            style={{
              borderWidth: 1,
              borderColor: theme.colors.cardBorder,
              borderRadius: theme.radius.input,
            }}
          >
            <Lock size={22} color={theme.colors.muted} />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              className="flex-1"
              style={{ color: theme.colors.ink }}
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
        </View>
        <View
          className="rounded-2xl px-4 py-3 gap-2"
          style={{
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.cardBorder,
            borderRadius: theme.radius.input,
          }}
        >
          {passwordRules.map((r) => (
            <RuleItem key={r.key} label={r.label} met={r.met} />
          ))}
        </View>
        <Pressable
          onPress={() => setIsDoctor(!isDoctor)}
          className="flex-row items-center gap-3 rounded-2xl px-4 py-3 bg-white active:opacity-80"
          style={{
            borderWidth: 1,
            borderColor: isDoctor ? theme.colors.primary : theme.colors.cardBorder,
          }}
        >
          <View
            className="w-5 h-5 rounded border items-center justify-center"
            style={
              isDoctor
                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                : { backgroundColor: "#FFFFFF", borderColor: theme.colors.faint }
            }
          >
            {isDoctor && <Check size={16} color="white" />}
          </View>
          <Stethoscope size={20} color={theme.colors.muted} />
          <Text className="flex-1 text-sm font-medium" style={{ color: theme.colors.ink }}>
            I&apos;m a doctor
          </Text>
        </Pressable>
        {isDoctor ? (
          <View className="flex-col gap-2">
            <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>
              Hospital Invite Code
            </Text>
            <View
              className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2"
              style={{
                borderWidth: 1,
                borderColor: theme.colors.cardBorder,
                borderRadius: theme.radius.input,
              }}
            >
              <Ticket size={22} color={theme.colors.muted} />
              <TextInput
                value={inviteCode}
                onChangeText={(t) => setInviteCode(t.toUpperCase())}
                placeholder="SKN-XXXXXX"
                className="flex-1"
                style={{ color: theme.colors.ink }}
                placeholderTextColor={theme.colors.faint}
                autoCapitalize="characters"
                // Uppercasing a controlled value fights the keyboard's predictive
                // text (duplicated / lowercase-flipping chars on Android), so turn
                // suggestions off; visible-password is the only reliable way on Gboard.
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
              />
            </View>
            <Text className="text-xs" style={{ color: theme.colors.muted }}>
              Ask your hospital admin for a code (website Admin → Invite codes).
            </Text>
          </View>
        ) : null}
        <Pressable onPress={() => setAgreed(!agreed)} className="flex-row items-center gap-3 mt-1">
          <View
            className="w-5 h-5 rounded border items-center justify-center"
            style={
              agreed
                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                : { backgroundColor: "#FFFFFF", borderColor: theme.colors.faint }
            }
          >
            {agreed && <Check size={16} color="white" />}
          </View>
          <Text className="flex-1" style={{ color: theme.colors.muted }}>
            I agree to the{" "}
            <Text
              onPress={(e) => {
                e.stopPropagation();
                setLegal("terms");
              }}
              accessibilityRole="button"
              accessibilityLabel="Read Terms and Conditions"
              className="font-medium underline"
              style={{ color: theme.colors.primary }}
            >
              Terms and Conditions
            </Text>
          </Text>
        </Pressable>
        <PrimaryButton label="Create Account" onPress={handleRegister} loading={loading} />
      </View>
      <LegalModal
        visible={legal !== null}
        type={legal ?? "terms"}
        onDismiss={() => setLegal(null)}
      />
    </KeyboardAwareScroll>
  );
}
