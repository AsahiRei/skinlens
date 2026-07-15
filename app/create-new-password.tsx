import {
  View,
  Text,
  Pressable,
  TextInput,
  ToastAndroid,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/utils/supabase";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import * as Linking from "expo-linking";

export default function CreateNewPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const { code } = useLocalSearchParams<{ code?: string }>();
  const sessionAttempted = useRef(false);
  const router = useRouter();
  useEffect(() => {
    const prepareSession = async (url: string | null) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
        setCheckingSession(false);
        return;
      }
      if (url && !sessionAttempted.current) {
        sessionAttempted.current = true;
        const parsed = new URL(url);
        const authCode = parsed.searchParams.get("code");
        if (authCode) {
          const { error } =
            await supabase.auth.exchangeCodeForSession(authCode);
          if (error) {
            ToastAndroid.show(
              "This reset link is invalid or expired. Please request a new one.",
              ToastAndroid.LONG,
            );
            router.replace("/forgot-password");
            setCheckingSession(false);
            return;
          }
          setSessionReady(true);
          setCheckingSession(false);
          return;
        }
      }
      ToastAndroid.show("Invalid reset link.", ToastAndroid.LONG);
      router.replace("/forgot-password");
      setCheckingSession(false);
    };
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          ToastAndroid.show(
            "This reset link is invalid or expired. Please request a new one.",
            ToastAndroid.LONG,
          );
          router.replace("/forgot-password");
          setCheckingSession(false);
          return;
        }
        setSessionReady(true);
        setCheckingSession(false);
      });
      return;
    }
    Linking.getInitialURL().then((url) => prepareSession(url));
    const subscription = Linking.addEventListener("url", ({ url }) =>
      prepareSession(url),
    );
    return () => subscription.remove();
  }, []);
  const handleForm = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        ToastAndroid.show(error.message, ToastAndroid.SHORT);
        return;
      }
      await supabase.auth.signOut();
      ToastAndroid.show("Password reset successfully.", ToastAndroid.SHORT);
      router.replace("/login");
    } catch (error: any) {
      ToastAndroid.show(error.message, ToastAndroid.SHORT);
    } finally {
      setLoading(false);
    }
  };
  if (checkingSession) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color="green" />
      </SafeAreaView>
    );
  }
  if (!sessionReady) return null;
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-4 gap-6">
        <Pressable
          className="items-center flex-row gap-1 self-start active:opacity-80"
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={18} color="black" />
          <Text className="text-lg font-semibold">Back</Text>
        </Pressable>
        <View className="gap-1">
          <Text className="text-4xl font-semibold text-green-700">
            Create New Password
          </Text>
          <Text className="text-lg text-gray-500">
            Enter your new password below.
          </Text>
        </View>
        <View className="flex-col gap-6">
          <View className="flex-col gap-2">
            <Text className="text-gray-700 font-medium">Password</Text>
            <View className="flex-row items-center border border-gray-400 rounded-full px-3 py-1 gap-1">
              <Ionicons
                name="lock-closed"
                size={22}
                color="gray"
                className="ml-2"
              />
              <TextInput
                className="flex-1"
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                placeholderTextColor="gray"
              />
              {showPassword ? (
                <Pressable onPress={() => setShowPassword(false)}>
                  <Ionicons name="eye-off" size={22} color="gray" />
                </Pressable>
              ) : (
                <Pressable onPress={() => setShowPassword(true)}>
                  <Ionicons name="eye" size={22} color="gray" />
                </Pressable>
              )}
            </View>
          </View>
          <View className="flex-col gap-2">
            <Text className="text-gray-700 font-medium">Confirm Password</Text>
            <View className="flex-row items-center border border-gray-400 rounded-full px-3 py-1 gap-1">
              <Ionicons
                name="lock-closed"
                size={22}
                color="gray"
                className="ml-2"
              />
              <TextInput
                className="flex-1"
                placeholder="Confirm your password"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholderTextColor="gray"
              />
              {showConfirmPassword ? (
                <Pressable onPress={() => setShowConfirmPassword(false)}>
                  <Ionicons name="eye-off" size={22} color="gray" />
                </Pressable>
              ) : (
                <Pressable onPress={() => setShowConfirmPassword(true)}>
                  <Ionicons name="eye" size={22} color="gray" />
                </Pressable>
              )}
            </View>
          </View>
        </View>
        <Pressable
          className={`${loading ? "bg-gray-300" : "bg-green-700"} active:opacity-80 py-4 rounded-full w-full`}
          disabled={loading}
          onPress={handleForm}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-center font-semibold">
              Confirm Changes
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
