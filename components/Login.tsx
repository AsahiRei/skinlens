import { useState } from "react";
import {
  Image,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Mail, Lock, Eye, EyeOff } from "lucide-react-native";

import { theme } from "@/lib/theme";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { PrimaryButton } from "@/components/ui";
import { signInWithGoogle, supabase } from "@/utils/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  //login
  const handleLogin = async () => {
    if (!email || !password) {
      ToastAndroid.show(
        "Please fill in all required fields",
        ToastAndroid.SHORT,
      );
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        ToastAndroid.show(error.message, ToastAndroid.LONG);
        return;
      }
      router.replace("/");
    } catch {
      ToastAndroid.show(
        "Something went wrong. Please try again.",
        ToastAndroid.SHORT,
      );
    } finally {
      setLoading(false);
    }
  };
  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      router.replace("/");
    } catch (e) {
      ToastAndroid.show(
        e instanceof Error ? e.message : "Something went wrong. Please try again.",
        ToastAndroid.LONG,
      );
    }
  };
  return (
    <KeyboardAwareScroll contentContainerStyle={{ flexGrow: 1, padding: 20 }}>
      <Pressable
        className="bg-white p-4 rounded-full active:opacity-80"
        style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
        onPress={handleGoogleLogin}
      >
        <View className="flex-row justify-center items-center gap-2">
          <Image
            source={require("@/assets/images/google.png")}
            style={{
              width: 20,
              height: 20,
            }}
          />
          <Text className="font-bold" style={{ color: theme.colors.body }}>Login with Google</Text>
        </View>
      </Pressable>
      <View className="flex-row items-center my-6">
        <View className="flex-1 h-px" style={{ backgroundColor: theme.colors.cardBorder }} />
        <Text className="mx-4 font-medium" style={{ color: theme.colors.muted }}>
          or continue with email
        </Text>
        <View className="flex-1 h-px" style={{ backgroundColor: theme.colors.cardBorder }} />
      </View>
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
        <Pressable
          className="active:opacity-80"
          onPress={() => router.push("/forgot-password")}
        >
          <Text className="underline" style={{ color: theme.colors.primary }}>Forgot password?</Text>
        </Pressable>
        <PrimaryButton label="Login" onPress={handleLogin} loading={loading} />
        <Text className="text-center px-4 mt-2" style={{ color: theme.colors.muted }}>
          By continuing, you agree to our{" "}
          <Text className="font-medium underline" style={{ color: theme.colors.primary }}>
            Terms and Conditions
          </Text>{" "}
          and{" "}
          <Text className="font-medium underline" style={{ color: theme.colors.primary }}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </KeyboardAwareScroll>
  );
}
