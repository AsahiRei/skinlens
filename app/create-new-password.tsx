import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Lock, Eye, EyeOff } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { supabase, updatePassword } from "@/utils/supabase";

export default function CreateNewPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const handleUpdatePassword = async () => {
    setLoading(true);
    try {
      await updatePassword(password);
      await supabase.auth.signOut();
      ToastAndroid.show("Change password successfully!", ToastAndroid.SHORT);
      router.replace("/welcome");
    } catch (error) {
      ToastAndroid.show(
        "Something went wrong. Please try again.",
        ToastAndroid.SHORT,
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-col px-6">
        <Text className="text-2xl font-bold text-green-700 text-center">
          Forgot Password
        </Text>
        <Text className="text-center text-gray-600 mt-2">
          Enter your email account to reset password
        </Text>
        <View className="flex-col gap-4 mt-6">
          <View className="flex-row items-center shadow bg-white rounded-full py-1 px-4 gap-2">
            <Lock size={22} color="#4B5563" />
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
              {showPassword ? (
                <EyeOff size={22} color="#4B5563" />
              ) : (
                <Eye size={22} color="#4B5563" />
              )}
            </Pressable>
          </View>
          <View className="flex-row items-center shadow bg-white rounded-full py-1 px-4 gap-2">
            <Lock size={22} color="#4B5563" />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              className="flex-1 text-gray-600"
              placeholderTextColor="gray"
              secureTextEntry={!showConfirmPassword}
            />
            <Pressable
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              className="active:opacity-60"
            >
              {showConfirmPassword ? (
                <EyeOff size={22} color="#4B5563" />
              ) : (
                <Eye size={22} color="#4B5563" />
              )}
            </Pressable>
          </View>
        </View>
        <View className="mt-4 flex-col gap-2">
          <Pressable
            className={`rounded-full ${loading ? "bg-gray-500" : "bg-green-700"} active:opacity-80 p-4`}
            onPress={handleUpdatePassword}
            disabled={loading}
          >
            <View className="flex-row items-center justify-center">
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-bold text-white">Change Password</Text>
              )}
            </View>
          </Pressable>
          <Pressable
            className="rounded-full border border-green-700 active:opacity-80 p-4"
            onPress={() => router.back()}
          >
            <View className="flex-row items-center justify-center gap-1">
              <Text className="text-center font-bold text-green-700">
                Cancel
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
