import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { Mail } from "lucide-react-native";
import { useRouter } from "expo-router";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { sendResetEmail } from "@/utils/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const handleResetEmail = async () => {
    setLoading(true);
    try {
      await sendResetEmail(email);
      ToastAndroid.show(
        "Email has been sent. Please check in your mailbox.",
        ToastAndroid.SHORT,
      );
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
        <View className="flex-row items-center shadow bg-white rounded-full py-1 px-4 gap-2 mt-6">
          <Mail size={22} color="#4B5563" />
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
        <View className="mt-4 flex-col gap-2">
          <Pressable
            className={`rounded-full ${loading ? "bg-gray-500" : "bg-green-700"} active:opacity-80 p-4`}
            onPress={handleResetEmail}
            disabled={loading}
          >
            <View className="flex-row items-center justify-center">
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-bold text-white">Continue</Text>
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
