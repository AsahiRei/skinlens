<<<<<<< HEAD
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { supabase } from "@/utils/supabase";

=======
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  ToastAndroid,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { supabase } from "@/utils/supabase";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";

>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [age, setAge] = useState("");
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
    if (!username || !email || !phoneNumber || !age || !password) {
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
          username: username.trim(),
          email: email.trim(),
          phone_number: phoneNumber.trim(),
          age: Number(age),
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
    <ScrollView
      className="flex-1"
      contentContainerClassName="p-6 pb-10"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-col gap-4">
        <View className="flex-row gap-3">
          <View className="flex-1 flex-col gap-2">
            <Text className="font-medium">Username</Text>
            <View className="flex-row items-center shadow bg-white rounded-full py-1 px-4 gap-2">
              <Ionicons name="person" size={20} color="#4B5563" />
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Username"
                className="flex-1 text-gray-600"
                placeholderTextColor="gray"
                autoCapitalize="none"
              />
            </View>
          </View>
          <View className="flex-1 flex-col gap-2">
            <Text className="font-medium">Phone Number</Text>
            <View className="flex-row items-center shadow bg-white rounded-full py-1 px-4 gap-2">
              <Ionicons name="call" size={20} color="#4B5563" />
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Phone Number"
                className="flex-1 text-gray-600"
                placeholderTextColor="gray"
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </View>
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
          <Text className="font-medium">Age</Text>
          <View className="flex-row items-center shadow bg-white rounded-full py-1 px-4 gap-2">
            <Ionicons name="calendar" size={22} color="#4B5563" />
            <TextInput
              value={age}
              onChangeText={setAge}
              placeholder="Enter your age"
              className="flex-1 text-gray-600"
              placeholderTextColor="gray"
              keyboardType="number-pad"
              maxLength={3}
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
        <View className="flex-col gap-2">
          <Text className="font-medium">Confirm Password</Text>
          <View className="flex-row items-center shadow bg-white rounded-full py-1 px-4 gap-2">
            <Ionicons name="lock-closed" size={22} color="#4B5563" />
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
              <Ionicons
                name={showConfirmPassword ? "eye-off" : "eye"}
                size={22}
                color="#4B5563"
              />
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={() => setAgreed(!agreed)}
          className="flex-row items-center gap-3 mt-1"
        >
          <View
            className={`w-5 h-5 rounded border items-center justify-center ${
              agreed
                ? "bg-green-800 border-green-800"
                : "bg-white border-gray-400"
            }`}
          >
            {agreed && <Ionicons name="checkmark" size={16} color="white" />}
          </View>
          <Text className="flex-1 text-gray-500">
            I agree to the{" "}
            <Text className="text-green-800 font-medium underline">
              Terms and Conditions
            </Text>
          </Text>
        </Pressable>
        <Pressable
          className={`rounded-full ${loading ? "bg-gray-500" : "bg-green-800"} active:opacity-80 p-4`}
          onPress={handleRegister}
          disabled={loading}
        >
          <View className="flex-row items-center justify-center">
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="font-bold text-white">Create Account</Text>
            )}
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}
