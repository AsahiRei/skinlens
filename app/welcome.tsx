import { useState } from "react";
import { Pressable, Text, View, Image } from "react-native";

import Login from "@/components/Login";
import Register from "@/components/Register";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";

export default function Welcome() {
  const [selected, setSelect] = useState("login");
  return (
    <SafeAreaView className="flex-1 bg-white">
      <Image
        source={require("@/assets/images/skinlens-icon.png")}
        className="w-20 h-20 mx-auto mt-8 rounded-3xl border border-gray-100"
      />
      <Text className="text-2xl font-bold text-green-800 text-center mt-4 tracking-tight">
        Welcome to SkinLens
      </Text>
      <Text className="text-center text-gray-500 mt-2 px-8 leading-6">
        Sign in to track your skin health and daily routine
      </Text>
      <View className="flex-row items-center mt-6 border-b border-gray-200">
        <Pressable
          onPress={() => setSelect("login")}
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === "login" }}
          className={`flex-1 py-3 border-b-2 ${
            selected === "login" ? "border-green-700" : "border-transparent"
          }`}
        >
          <Text
            className={`text-center font-medium ${
              selected === "login" ? "text-green-700" : "text-gray-500"
            }`}
          >
            Login
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSelect("signup")}
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === "signup" }}
          className={`flex-1 py-3 border-b-2 ${
            selected === "signup" ? "border-green-700" : "border-transparent"
          }`}
        >
          <Text
            className={`text-center font-medium ${
              selected === "signup" ? "text-green-700" : "text-gray-500"
            }`}
          >
            Sign Up
          </Text>
        </Pressable>
      </View>
      <View className="flex-1 bg-gray-50">
        {selected === "login" ? <Login /> : <Register />}
      </View>
    </SafeAreaView>
  );
}
