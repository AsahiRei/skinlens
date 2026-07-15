import { View, Text, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";

export default function Index() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-start px-4">
        <Image
          source={require("@/assets/images/onboarding/3.png")}
          className="w-100 h-100 object-contain"
        />
        <View className="gap-2 flex-col">
          <Text className="text-center font-semibold text-4xl">
            Let{`'`}s Personalize Your Experience
          </Text>
          <Text className="text-center text-gray-500">
            Answer a few quick questions so we can understand your skin,
            lifestyle, and goals to create recommendations just for you.
          </Text>
        </View>
        <View className="gap-4 flex-col w-full">
          <Pressable
            className="mt-6 bg-green-700 py-4 rounded-full active:opacity-80"
            onPress={() => router.push("/(user)/profile-setup")}
          >
            <Text className="text-center text-white font-semibold">
              Get Started
            </Text>
          </Pressable>
          <Pressable
            className="rounded-full border border-gray-400 py-4 active:opacity-80"
            onPress={() => router.push("/(user)/(tabs)")}
          >
            <Text className="text-center text-gray-500 font-semibold">
              Maybe Later
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
