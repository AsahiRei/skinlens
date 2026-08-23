import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";

export default function scan() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center">
      <Pressable onPress={() => router.push("/(modules)/camera")}>
        <Text>Go to Camera</Text>
      </Pressable>
    </View>
  );
}
