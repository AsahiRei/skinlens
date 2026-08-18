import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";

export default function index() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-white items-center justify-center p-6">
      <Text className="text-3xl font-bold text-center text-green-800">
        Let’s get to know your skin
      </Text>
      <Text className="mt-3 text-center text-gray-600">
        Answer a few quick questions to help us personalize your SkinLens
        experience.
      </Text>
      <Pressable
        className="rounded-full bg-green-800 active:opacity-80 p-4 w-full mt-4"
        onPress={() => router.push("/(user-setup)/setup")}
      >
        <Text className="font-bold text-white text-center">Continue</Text>
      </Pressable>
    </View>
  );
}
