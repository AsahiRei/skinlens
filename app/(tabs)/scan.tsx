import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Images,
  ChevronRight,
  Sparkles,
  FileText,
  AlertTriangle,
  Sun,
  Move,
  Focus,
} from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import scanContent from "@/data/scan-content.json";

const SCAN_ICON_MAP: Record<string, typeof Camera> = {
  camera: Camera,
  sparkles: Sparkles,
  "file-text": FileText,
  sun: Sun,
  move: Move,
  focus: Focus,
};

const HOW_IT_WORKS = scanContent.howItWorks.map((item) => ({
  ...item,
  icon: SCAN_ICON_MAP[item.icon] ?? Camera,
}));

const CAPTURE_TIPS = scanContent.captureTips.map((item) => ({
  ...item,
  icon: SCAN_ICON_MAP[item.icon] ?? Sun,
}));

const DISCLAIMER = scanContent.disclaimer;

export default function Scan() {
  const router = useRouter();

  const handleUploadPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Please allow photo library access to upload an image.",
      );
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        router.push({
          pathname: "/(modules)/analyzing",
          params: { imageUri: result.assets[0].uri, sourceType: "gallery" },
        });
      }
    } catch {
      Alert.alert(
        "Couldn't open gallery",
        "Please try again or use the camera instead.",
      );
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
      >
        <Text className="font-bold text-green-700 text-2xl">Skin Scan</Text>
        <Text className="text-gray-500 mt-1">Analyze your skin with a photo</Text>

        {/* Action buttons */}
        <View className="flex-col gap-3 mt-6">
          <Pressable
            onPress={() => router.push("/(modules)/camera")}
            className="bg-white rounded-xl border border-gray-100 py-4 px-4 flex-row items-center gap-3 active:opacity-80"
          >
            <View className="h-12 w-12 rounded-2xl items-center justify-center bg-green-100">
              <Camera size={22} color="#15803D" />
            </View>
            <View className="flex-col flex-1 gap-0.5">
              <Text className="font-bold text-gray-900 text-[15px]">Use Camera</Text>
              <Text className="text-xs text-gray-500">
                Take a new photo with guided alignment
              </Text>
            </View>
            <ChevronRight size={18} color="#9CA3AF" />
          </Pressable>

          <Pressable
            onPress={handleUploadPhoto}
            className="bg-white rounded-xl border border-gray-100 py-4 px-4 flex-row items-center gap-3 active:opacity-80"
          >
            <View className="h-12 w-12 rounded-2xl items-center justify-center bg-green-100">
              <Images size={22} color="#15803D" />
            </View>
            <View className="flex-col flex-1 gap-0.5">
              <Text className="font-bold text-gray-900 text-[15px]">Upload Photo</Text>
              <Text className="text-xs text-gray-500">
                Choose an existing photo from your gallery
              </Text>
            </View>
            <ChevronRight size={18} color="#9CA3AF" />
          </Pressable>
        </View>

        {/* How it works */}
        <View className="mt-8">
          <Text className="font-bold text-gray-900 text-lg">How It Works</Text>
          <View className="bg-white rounded-xl border border-gray-100 mt-3 overflow-hidden">
            {HOW_IT_WORKS.map((item, index) => (
              <View
                key={item.title}
                className="py-4 px-4 flex-row items-start gap-3"
                style={index < HOW_IT_WORKS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" } : {}}
              >
                <View className="h-7 w-7 rounded-full items-center justify-center mt-0.5 bg-green-100">
                  <Text className="text-green-700 font-bold text-xs">{index + 1}</Text>
                </View>
                <View className="flex-col flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <item.icon size={13} color="#15803D" />
                    <Text className="font-bold text-gray-900 text-sm">{item.title}</Text>
                  </View>
                  <Text className="text-xs text-gray-500">{item.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Capture tips */}
        <View className="mt-6">
          <Text className="font-bold text-gray-900 text-lg">Tips for Best Results</Text>
          <View className="bg-green-50 rounded-xl mt-3 overflow-hidden">
            {CAPTURE_TIPS.map((item, index) => (
              <View
                key={item.title}
                className="py-3 px-4 flex-row items-start gap-3"
                style={index < CAPTURE_TIPS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "rgba(22,163,74,0.1)" } : {}}
              >
                <View className="h-7 w-7 rounded-full items-center justify-center mt-0.5 bg-green-100">
                  <item.icon size={14} color="#15803D" />
                </View>
                <View className="flex-col flex-1 gap-0.5">
                  <Text className="font-bold text-gray-900 text-sm">{item.title}</Text>
                  <Text className="text-xs text-gray-600">{item.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Disclaimer */}
        <View className="bg-amber-50 rounded-xl py-4 px-4 flex-row items-start gap-3 mt-6">
          <AlertTriangle size={18} color="#B45309" style={{ marginTop: 1 }} />
          <Text className="text-xs text-amber-800 flex-1 leading-5">
            {DISCLAIMER}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
