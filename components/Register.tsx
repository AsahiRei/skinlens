import { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { User, Mail, Lock, Eye, EyeOff, Check, Stethoscope, Ticket } from "lucide-react-native";

import { theme } from "@/lib/theme";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { PrimaryButton } from "@/components/ui";
import { supabase } from "@/utils/supabase";
import { redeemInviteCode } from "@/lib/db/appointments";

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
  const router = useRouter();
  //register
  const handleRegister = async () => {
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleRegister start email=`, email);
    // Validate before loading
    if (!agreed) {
      ToastAndroid.show(
        "Please agree to the Terms and Conditions",
        ToastAndroid.SHORT,
      );
      return;
    }
    if (!email || !password) {
      ToastAndroid.show(
        "Please fill in all required fields",
        ToastAndroid.SHORT,
      );
      return;
    }
    if (password !== confirmPassword) {
      ToastAndroid.show("Password does not match", ToastAndroid.SHORT);
      return;
    }
    if (password.length < 6) {
      ToastAndroid.show(
        "Password must be at least 6 characters",
        ToastAndroid.SHORT,
      );
      return;
    }
    const cleanName = displayName.trim();
    if (isDoctor && !cleanName) {
      ToastAndroid.show("Please enter your name", ToastAndroid.SHORT);
      return;
    }
    // Doctors must supply the hospital invite code (Admin → Invite codes).
    const cleanCode = inviteCode.trim().toUpperCase();
    if (isDoctor && !cleanCode) {
      ToastAndroid.show(
        "Doctors need a hospital invite code",
        ToastAndroid.SHORT,
      );
      return;
    }
    setLoading(true);
    try {
      // 1. Create Supabase authentication account
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} signUp start`);
      const { data: authData, error: registerError } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
      if (registerError) {
        console.log(`[SkinLens][Auth] ${new Date().toISOString()} signUp failed:`, registerError.message);
        ToastAndroid.show(registerError.message, ToastAndroid.LONG);
        return;
      }
      const user = authData.user;
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} signUp success user=`, user?.id ?? null, `session=`, !!authData.session);
      if (!user) {
        console.log(`[SkinLens][Auth] ${new Date().toISOString()} signUp no user returned (email confirmation?)`);
        ToastAndroid.show(
          "Registration failed. Please try again.",
          ToastAndroid.SHORT,
        );
        return;
      }
      // Without a session (email confirmation ON) the profile insert + code
      // redeem would fail RLS — stop here and let the user confirm first.
      if (!authData.session) {
        ToastAndroid.show(
          "Check your email to confirm, then sign in.",
          ToastAndroid.LONG,
        );
        router.replace("/");
        return;
      }
      // 2. Create user profile
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} profile insert start user=`, user.id);
      const { error: insertError } = await supabase
        .from("user_profile")
        .insert({
          id: user.id,
          username: isDoctor ? cleanName : undefined,
          first_name: isDoctor ? cleanName : undefined,
          email: email.trim(),
        });

      if (insertError) {
        console.log(`[SkinLens][Auth] ${new Date().toISOString()} profile insert failed:`, insertError.message);
        ToastAndroid.show(insertError.message, ToastAndroid.LONG);
        return;
      }
      // 3. Doctor path: tie this account to ONE hospital via invite code.
      // redeem_clinic_code() stamps role='doctor' + burns one code use.
      if (isDoctor) {
        try {
          const res = await redeemInviteCode(cleanCode, cleanName);
          console.log(`[SkinLens][Auth] ${new Date().toISOString()} redeem success clinic=`, res.clinic_name);
          ToastAndroid.show(
            `Doctor account linked to ${res.clinic_name}!`,
            ToastAndroid.LONG,
          );
        } catch (redeemErr) {
          console.log(`[SkinLens][Auth] ${new Date().toISOString()} redeem failed:`, redeemErr);
          // Patient profile already exists — user can retry the code later
          // from Appointments instead of losing the whole account.
          ToastAndroid.show(
            redeemErr instanceof Error
              ? redeemErr.message
              : "Invalid invite code.",
            ToastAndroid.LONG,
          );
        }
      } else {
        ToastAndroid.show("Account created successfully!", ToastAndroid.SHORT);
      }
      // 4. Registration successful
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleRegister success user=`, user.id);
      router.replace("/");
    } catch (error) {
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleRegister exception:`, error);
      console.error("Registration error:", error);
      ToastAndroid.show(
        "Something went wrong. Please try again.",
        ToastAndroid.SHORT,
      );
    } finally {
      // Always stop loading
      setLoading(false);
    }
  };
  return (
    <KeyboardAwareScroll contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 40 }}>
      <View className="flex-col gap-4">

        {isDoctor ? (
          <View className="flex-col gap-2">
            <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>Full Name</Text>
            <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.input }}>
              <User size={22} color={theme.colors.muted} />
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Dr. Jane Cruz"
                className="flex-1"
                style={{ color: theme.colors.ink }}
                placeholderTextColor={theme.colors.faint}
                autoCapitalize="words"
              />
            </View>
          </View>
        ) : null}
        <View className="flex-col gap-2">
          <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>Email Address</Text>
          <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.input }}>
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
          <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>Password</Text>
          <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.input }}>
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
        </View>
        <View className="flex-col gap-2">
          <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>Confirm Password</Text>
          <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.input }}>
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
        <Pressable
          onPress={() => setIsDoctor(!isDoctor)}
          className="flex-row items-center gap-3 rounded-2xl px-4 py-3 bg-white active:opacity-80"
          style={{ borderWidth: 1, borderColor: isDoctor ? theme.colors.primary : theme.colors.cardBorder }}
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
            <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>Hospital Invite Code</Text>
            <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.input }}>
              <Ticket size={22} color={theme.colors.muted} />
              <TextInput
                value={inviteCode}
                onChangeText={(t) => setInviteCode(t.toUpperCase())}
                placeholder="SKN-XXXXXX"
                className="flex-1"
                style={{ color: theme.colors.ink }}
                placeholderTextColor={theme.colors.faint}
                autoCapitalize="characters"
              />
            </View>
            <Text className="text-xs" style={{ color: theme.colors.muted }}>
              Ask your hospital admin for a code (website Admin → Invite codes).
            </Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => setAgreed(!agreed)}
          className="flex-row items-center gap-3 mt-1"
        >
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
            <Text className="font-medium underline" style={{ color: theme.colors.primary }}>
              Terms and Conditions
            </Text>
          </Text>
        </Pressable>
        <PrimaryButton label="Create Account" onPress={handleRegister} loading={loading} />
      </View>
    </KeyboardAwareScroll>
  );
}
