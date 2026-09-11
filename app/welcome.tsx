import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import Login from "@/components/Login";
import ModelDownloadModal from "@/components/ModelDownloadModal";
import Register from "@/components/Register";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { isModelDownloaded } from "@/utils/llama";

export default function Welcome() {
  const [selected, setSelect] = useState("login");
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  useEffect(() => {
    isModelDownloaded().then((downloaded) => {
      if (!downloaded) setShowDownloadModal(true);
    });
  }, []);
  return (
    <SafeAreaView className="flex-1 bg-white">
      <Text className="text-2xl font-bold text-green-700 text-center">
        Welcome to SkinLens
      </Text>
      <Text className="text-center text-gray-600 mt-2">
        Sign up or login bellow to manage your skin and productivity
      </Text>
      <View className="flex-row items-center mt-6 border-b border-gray-200">
        <Pressable
          onPress={() => setSelect("login")}
          className={`flex-1 py-3 ${
            selected === "login" ? "border-b-2 border-green-700" : ""
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
          className={`flex-1 py-3 ${
            selected === "signup" ? "border-b-2 border-green-700" : ""
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
      <ModelDownloadModal
        visible={showDownloadModal}
        onComplete={() => setShowDownloadModal(false)}
        onCancel={() => setShowDownloadModal(false)}
      />
    </SafeAreaView>
  );
}
