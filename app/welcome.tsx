import { View, Text, Pressable } from "react-native";
import { useState } from "react";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import Login from "@/components/Login";
import Register from "@/components/Register";

export default function Welcome() {
  const [selected, setSelect] = useState("login");
  return (
    <SafeAreaView className="flex-1 bg-white">
      <Text className="text-2xl font-bold text-green-800 text-center">
        Welcome to SkinLens
      </Text>
      <Text className="text-center text-gray-600 mt-2">
        Sign up or login bellow to manage your skin and productivity
      </Text>
      <View className="flex-row items-center mt-6 border-b border-gray-200">
        <Pressable
          onPress={() => setSelect("login")}
          className={`flex-1 py-3 ${
            selected === "login" ? "border-b-2 border-green-800" : ""
          }`}
        >
          <Text
            className={`text-center font-medium ${
              selected === "login" ? "text-green-800" : "text-gray-500"
            }`}
          >
            Login
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSelect("signup")}
          className={`flex-1 py-3 ${
            selected === "signup" ? "border-b-2 border-green-800" : ""
          }`}
        >
          <Text
            className={`text-center font-medium ${
              selected === "signup" ? "text-green-800" : "text-gray-500"
            }`}
          >
            Sign Up
          </Text>
        </Pressable>
      </View>
      <View className="flex-1 bg-gray-100">
        {selected === "login" ? <Login /> : <Register />}
      </View>
    </SafeAreaView>
  );
}
