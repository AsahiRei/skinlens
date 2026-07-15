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
import * as Linking from "expo-linking";

const redirectTo = Linking.createURL("/create-new-password");

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const handleForm = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        ToastAndroid.show(error.message, ToastAndroid.SHORT);
        return;
      }
      ToastAndroid.show("Password reset email sent", ToastAndroid.SHORT);
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
          <Text className="text-4xl font-semibold text-green-700">
            Forgot Password?
          </Text>
          <Text className="text-lg text-gray-500">
            Enter your email to reset your password.
          </Text>
        </View>
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
        <Pressable
          className={`${loading ? "bg-gray-300" : "bg-green-700"} active:opacity-80 py-4 rounded-full w-full`}
          disabled={loading}
          onPress={handleForm}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-center font-semibold">
              Send Email Confirmation
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
