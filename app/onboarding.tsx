import { View, Text, Image, Pressable } from "react-native";
import { useState, useRef } from "react";
import { useRouter } from "expo-router";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { onboardingPages } from "@/data/onboarding";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PageView from "react-native-pager-view";

export default function Onboarding() {
  const pageViewRef = useRef<PageView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const router = useRouter();
  const skip = async () => {
    router.push("/welcome");
    await AsyncStorage.setItem("is_onboarding", "true");
  };
  const nextPage = async () => {
    if (currentPage < onboardingPages.length - 1) {
      pageViewRef.current?.setPage(currentPage + 1);
    } else {
      await skip();
    }
  };
  return (
    <SafeAreaView className="flex-1 bg-white">
      <PageView
        ref={pageViewRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={(e) => {
          setCurrentPage(e.nativeEvent.position);
        }}
      >
        {onboardingPages.map((page, index) => (
          <View
            key={index}
            className="flex-1 items-center justify-start px-4 py-6 gap-4"
          >
            <Image source={page.image} className="w-100 h-100 object-contain" />
            <View className="flex-col gap-1">
              <Text className="text-center font-semibold text-4xl">
                {page.title}
              </Text>
              <Text className="text-center text-gray-500">{page.subtitle}</Text>
            </View>
          </View>
        ))}
      </PageView>
      <View className="flex-row px-4 gap-2 mb-6 self-center">
        {onboardingPages.map((_, index) => (
          <View
            key={index}
            className={`${index === currentPage ? "bg-green-700" : "bg-gray-300"} w-4 h-1.5 rounded-full`}
          />
        ))}
      </View>
      <View className="mb-4 flex-col gap-2 px-4">
        <Pressable
          className="bg-green-700 py-4 rounded-full active:opacity-80"
          onPress={nextPage}
        >
          <Text className="text-center font-semibold text-white">
            {currentPage === onboardingPages.length - 1
              ? "Get Started"
              : "Next"}
          </Text>
        </Pressable>
        <Pressable
          className="rounded-full border border-gray-400 py-4 active:opacity-80"
          onPress={skip}
        >
          <Text className="text-center text-gray-500 font-semibold">Skip</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
