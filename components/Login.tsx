<<<<<<< HEAD
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";

import { signInWithGoogle, supabase } from "@/utils/supabase";

=======
import {
  View,
  Text,
  Pressable,
  Image,
  TextInput,
  ScrollView,
  ToastAndroid,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { supabase, signInWithGoogle } from "@/utils/supabase";
import Ionicons from "@react-native-vector-icons/ionicons";

>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
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
    } catch (error) {
      ToastAndroid.show(
        "Something went wrong. Please try again.",
        ToastAndroid.SHORT,
      );
    } finally {
      setLoading(false);
    }
  };
  const handeGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      router.replace("/");
    } catch (e: any) {
      ToastAndroid.show(
        e?.message ?? "Something went wrong. Please try again.",
        ToastAndroid.LONG,
      );
    }
  };
  return (
    <ScrollView
      contentContainerClassName="p-6"
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        className="bg-white p-4 rounded-full shadow active:opacity-80"
        onPress={handeGoogleLogin}
      >
        <View className="flex-row justify-center items-center gap-2">
          <Image
            source={require("@/assets/images/google.png")}
            style={{
              width: 20,
              height: 20,
            }}
          />
          <Text className="font-bold text-gray-600">Login with Google</Text>
        </View>
      </Pressable>
      <View className="flex-row items-center my-6">
        <View className="flex-1 h-px bg-gray-300" />
        <Text className="mx-4 text-gray-500 font-medium">
          or continue with email
        </Text>
        <View className="flex-1 h-px bg-gray-300" />
      </View>
      <View className="flex-col gap-4">
        <View className="flex-col gap-2">
          <Text className="font-medium">Email Address</Text>
          <View className="flex-row items-center shadow bg-white rounded-full py-1 px-4 gap-2">
            <Ionicons name="mail" size={22} color="#4B5563" />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email address"
              className="flex-1 text-gray-600"
              placeholderTextColor="gray"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>
        <View className="flex-col gap-2">
          <Text className="font-medium">Password</Text>
          <View className="flex-row items-center shadow bg-white rounded-full py-1 px-4 gap-2">
            <Ionicons name="lock-closed" size={22} color="#4B5563" />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              className="flex-1 text-gray-600"
              placeholderTextColor="gray"
              secureTextEntry={!showPassword}
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              className="active:opacity-60"
            >
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={22}
                color="#4B5563"
              />
            </Pressable>
          </View>
        </View>
        <Pressable
          className="active:opacity-80"
          onPress={() => router.push("/forgot-password")}
        >
          <Text className="underline text-green-700">Forgot password?</Text>
        </Pressable>
        <Pressable
          className={`rounded-full ${loading ? "bg-gray-500" : "bg-green-700"} active:opacity-80 p-4`}
          onPress={handleLogin}
          disabled={loading}
        >
          <View className="flex-row items-center justify-center">
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="font-bold text-white">Login</Text>
            )}
          </View>
        </Pressable>
        <Text className="text-center text-gray-500 px-4 mt-2">
          By continuing, you agree to our{" "}
          <Text className="text-green-700 font-medium underline">
            Terms and Conditions
          </Text>{" "}
          and{" "}
          <Text className="text-green-700 font-medium underline">
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </ScrollView>
  );
}
