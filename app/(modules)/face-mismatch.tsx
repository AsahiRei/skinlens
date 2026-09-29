import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScanFace, Camera, RefreshCw } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";

export default function FaceMismatch() {
  const router = useRouter();
  const { similarity } = useLocalSearchParams<{ similarity?: string }>();
  const pct =
    similarity !== undefined && similarity !== ""
      ? Math.round(Number(similarity) * 100)
      : null;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 px-6 items-center justify-center">
        <View className="bg-white rounded-3xl border border-gray-100 shadow-sm py-10 px-6 items-center gap-3 w-full">
          <View className="h-20 w-20 rounded-full bg-red-50 items-center justify-center">
            <ScanFace size={36} color="#B91C1C" />
          </View>
          <Text className="font-bold text-gray-900 text-2xl text-center">
            Face Not Matched
          </Text>
          <Text className="text-sm text-gray-500 text-center leading-5">
            This face doesn&apos;t match the one enrolled on this account, so
            the scan can&apos;t continue to the survey. Try again in good
            lighting, looking straight at the camera.
          </Text>
          {pct !== null && Number.isFinite(pct) && (
            <View className="bg-gray-50 rounded-full px-4 py-2">
              <Text className="text-xs font-semibold text-gray-500">
                Match score: {pct}%
              </Text>
            </View>
          )}
          <Pressable
            className="rounded-full bg-green-700 active:opacity-80 px-6 py-4 mt-2 w-full"
            onPress={() => router.replace("/(modules)/camera")}
          >
            <View className="flex-row items-center justify-center gap-2">
              <Camera size={18} color="white" />
              <Text className="font-bold text-white text-center">Retry Scan</Text>
            </View>
          </Pressable>
          <Pressable
            className="rounded-full border border-green-700 active:opacity-80 px-6 py-4 w-full"
            onPress={() =>
              router.replace({
                pathname: "/(user-setup)/face-enroll",
                params: { mode: "reenroll" },
              })
            }
          >
            <View className="flex-row items-center justify-center gap-2">
              <RefreshCw size={16} color="#15803D" />
              <Text className="font-bold text-green-700 text-center">
                Update My Face
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={() => router.back()} className="active:opacity-70 mt-1">
            <Text className="text-sm font-semibold text-gray-400">Go Back</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
