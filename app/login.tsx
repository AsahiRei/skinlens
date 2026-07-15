import {
  View,
  Text,
  Pressable,
  TextInput,
  ToastAndroid,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { supabase } from "@/utils/supabase";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";

export default function ComponentName() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  //login
  const handleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        ToastAndroid.show(error.message, ToastAndroid.SHORT);
        return;
      }
      router.replace("/");
    } catch (error: any) {
      ToastAndroid.show(error.message, ToastAndroid.SHORT);
    } finally {
      setLoading(false);
    }
  };
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
          <Text className="text-4xl font-semibold text-green-700">Sign In</Text>
          <Text className="text-lg text-gray-500">
            Login to continue with your account.
          </Text>
        </View>
        <View className="flex-col gap-6">
          <View className="flex-col gap-2">
            <Text className="text-gray-700 font-medium">Email Address</Text>
            <View className="flex-row items-center border border-gray-400 rounded-full px-3 py-1 gap-1">
              <Ionicons name="mail" size={22} color="gray" className="ml-2" />
              <TextInput
                className="flex-1"
                placeholder="Enter your email address"
                value={email}
                onChangeText={setEmail}
                placeholderTextColor="gray"
              />
            </View>
          </View>
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
                className="flex-1 text-gray-500"
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
          <Pressable
            className="active:opacity-80"
            onPress={() => router.push("/forgot-password")}
          >
            <Text className="text-gray-500">Forgot Password?</Text>
          </Pressable>
        </View>
        <Pressable
          className={`${loading ? "bg-gray-300" : "bg-green-700"} active:opacity-80 py-4 rounded-full w-full`}
          disabled={loading}
          onPress={handleLogin}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-center font-semibold">Login</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}