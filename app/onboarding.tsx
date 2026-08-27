<<<<<<< HEAD
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import PagerView from "react-native-pager-view";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
=======
import { View, Text, Pressable } from "react-native";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useState, useRef } from "react";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import PagerView from "react-native-pager-view";
import AsyncStorage from "@react-native-async-storage/async-storage";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38

const onboardingPage = [
  {
    title: "Understand Your Skin",
    description:
      "Learn more about your skin and identify possible skin concerns.",
  },
  {
    title: "Take a Clear Photo",
    description: "Capture a clear photo of your skin to get better results.",
  },
  {
    title: "Get AI-Powered Insights",
    description:
      "SkinLens analyzes your photo and provides helpful skin insights.",
  },
  {
    title: "Track Your Skin",
    description: "Monitor your skin over time and keep track of your progress.",
  },
];

export default function Onboarding() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const router = useRouter();
  const handleNext = async () => {
    if (page < onboardingPage.length - 1) {
      pagerRef.current?.setPage(page + 1);
    } else {
      await AsyncStorage.setItem("is_onboarded", "true");
      router.replace("/welcome");
    }
  };
  const skip = async () => {
    await AsyncStorage.setItem("is_onboarded", "true");
    router.replace("/welcome");
  };
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="mb-6 flex-row items-center justify-center gap-2 px-6">
        {onboardingPage.map((_, index) => (
          <View
            key={index}
            className={`h-2 flex-1 rounded-full ${
              page === index ? "bg-green-800" : "bg-gray-300"
            }`}
          />
        ))}
      </View>
      <PagerView
        style={{ flex: 1 }}
        ref={pagerRef}
        initialPage={0}
        onPageSelected={(event) => {
          setPage(event.nativeEvent.position);
        }}
      >
        {onboardingPage.map((item, index) => (
          <View key={index} className="items-center justify-center px-6">
            <Text className="text-3xl font-bold text-center text-green-800">
              {item.title}
            </Text>
            <Text className="mt-3 text-center text-gray-600">
              {item.description}
            </Text>
          </View>
        ))}
      </PagerView>
      <View className="mx-6 mb-8 gap-2">
        <Pressable
          className="rounded-full bg-green-800 active:opacity-80 p-4"
          onPress={handleNext}
        >
          <View className="flex-row items-center justify-center gap-1">
            <Text className="font-bold text-white">
              {page === onboardingPage.length - 1 ? "Get Started" : "Next"}
            </Text>
            {page !== onboardingPage.length - 1 && (
              <Ionicons name="arrow-forward" size={16} color="white" />
            )}
          </View>
        </Pressable>
        {page !== onboardingPage.length - 1 && (
          <Pressable
            className="rounded-full border border-gray-400 p-4 active:opacity-80"
            onPress={skip}
          >
            <Text className="text-center font-bold text-gray-700">Skip</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
