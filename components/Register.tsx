import { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Mail, Lock, Eye, EyeOff, Check } from "lucide-react-native";

import { theme } from "@/lib/theme";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { PrimaryButton } from "@/components/ui";
import { supabase } from "@/utils/supabase";

export default function Register() {
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
    setLoading(true);
    try {
      // 1. Create Supabase authentication account
      const { data: authData, error: registerError } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
      if (registerError) {
        ToastAndroid.show(registerError.message, ToastAndroid.LONG);
        return;
      }
      const user = authData.user;
      if (!user) {
        ToastAndroid.show(
          "Registration failed. Please try again.",
          ToastAndroid.SHORT,
        );
        return;
      }
      // 2. Create user profile
      const { error: insertError } = await supabase
        .from("user_profile")
        .insert({
          id: user.id,
          email: email.trim(),
        });

      if (insertError) {
        ToastAndroid.show(insertError.message, ToastAndroid.LONG);
        return;
      }
      // 3. Registration successful
      ToastAndroid.show("Account created successfully!", ToastAndroid.SHORT);
      router.replace("/");
    } catch (error) {
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
        <View className="flex-col gap-2">
          <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>Email Address</Text>
          <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.input }}>
            <Mail size={22} color={theme.colors.muted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email address"
              className="flex-1 text-[#10241A]"
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
        </View>
        <View className="flex-col gap-2">
          <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>Confirm Password</Text>
          <View className="flex-row items-center bg-white rounded-2xl px-4 py-3 gap-2" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.input }}>
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
        </View>
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
