import { useState } from "react";
import {
  Pressable,
  Platform,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { User, Mail, Lock, Eye, EyeOff, Check, Stethoscope, Ticket } from "lucide-react-native";

import { theme } from "@/lib/theme";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import LegalModal from "@/components/LegalModal";
import { PrimaryButton } from "@/components/ui";
import { supabase } from "@/utils/supabase";
import {
  checkInviteCode,
  clearPendingDoctorSignup,
  redeemInviteCode,
} from "@/lib/db/appointments";
import { friendlyError } from "@/lib/db/pg-errors";

// The doctor name field already shows "Dr.", so drop it if typed or pasted
// to avoid saving "Dr. Dr. Jane".
function stripDrPrefix(name: string) {
  return name.replace(/^\s*dr\.?\s+/i, "");
}

// Live password checklist shown under the Confirm Password field.
function getPasswordRules(password: string, confirm: string) {
  return [
    { key: "length", label: "At least 8 characters", met: password.length >= 8 },
    { key: "number", label: "One number", met: /\d/.test(password) },
    { key: "match", label: "Passwords match", met: password.length > 0 && password === confirm },
  ];
}

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
            ? { backgroundColor: theme.colors.primary, borderWidth: 1.5, borderColor: theme.colors.primary }
            : { backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: theme.colors.faint }
        }
      >
        {met && <Check size={12} color="white" strokeWidth={3} />}
      </View>
      <Text
        className="text-xs"
        style={{ color: met ? theme.colors.primary : theme.colors.muted, fontWeight: met ? "600" : "400" }}
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
  //register
  const handleRegister = async () => {
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleRegister start`);

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
    const unmet = passwordRules.find((r) => !r.met);
    if (unmet) {
      ToastAndroid.show(`Password needs: ${unmet.label.toLowerCase()}`, ToastAndroid.SHORT);
      return;
    }
    const bareName = stripDrPrefix(displayName).trim();
    if (isDoctor && !bareName) {
      ToastAndroid.show("Please enter your name", ToastAndroid.SHORT);
      return;
    }
    // The field shows a fixed "Dr." prefix; save the full title + name.
    const cleanName = `Dr. ${bareName}`;
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
      // 0. Doctor path: validate the invite code BEFORE creating the auth
      // account. A bad code used to leave an orphan account the doctor
      // could neither re-register with nor upgrade from.
      if (isDoctor) {
        try {
          await checkInviteCode(cleanCode);
        } catch (checkErr) {
          console.log(`[SkinLens][Auth] ${new Date().toISOString()} invite pre-check failed:`, checkErr);
          ToastAndroid.show(
            friendlyError(checkErr, "Invalid invite code."),
            ToastAndroid.LONG,
          );
          return;
        }
      }
      // 1. Create Supabase authentication account. Doctors carry the code in
      // user_metadata so it survives email confirmation / a failed redeem —
      // app/index.tsx routes such accounts to /doctor-setup to finish.
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} signUp start`);
      const { data: authData, error: registerError } =
        await supabase.auth.signUp({
          email: email.trim(),
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
        ToastAndroid.show(
          friendlyError(insertError, "Couldn't create your profile. Please try again."),
          ToastAndroid.LONG,
        );
        return;
      }
      // 3. Doctor path: tie this account to ONE hospital via invite code.
      // redeem_clinic_code() stamps role='doctor' + burns one code use.
      if (isDoctor) {
        try {
          const res = await redeemInviteCode(cleanCode, cleanName);
          console.log(`[SkinLens][Auth] ${new Date().toISOString()} redeem success clinic=`, res.clinic_name);
          // Best effort: a stale marker is harmless — /doctor-setup sees the
          // doctors row and clears it on the next boot.
          await clearPendingDoctorSignup().catch((e) =>
            console.warn("[Register] clear pending doctor marker failed:", e),
          );
          ToastAndroid.show(
            `Doctor account linked to ${res.clinic_name}!`,
            ToastAndroid.LONG,
          );
        } catch (redeemErr) {
          // The account already exists — keep it signed in and let the
          // doctor retry with another code instead of stranding it.
          console.log(`[SkinLens][Auth] ${new Date().toISOString()} redeem failed:`, redeemErr);
          ToastAndroid.show(
            friendlyError(redeemErr, "Couldn't link your hospital yet."),
            ToastAndroid.LONG,
          );
          router.replace("/doctor-setup");
          return;
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
