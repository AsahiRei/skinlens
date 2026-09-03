import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Camera, Images, ChevronRight, Sparkles, FileText, AlertTriangle } from "lucide-react-native";

import FadeInView from "@/components/FadeInView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useFocusTrigger } from "@/hooks";

const HOW_IT_WORKS = [
  {
    icon: Camera,
    title: "Capture or upload",
    description: "Take a clear photo or choose one from your gallery.",
  },
  {
    icon: Sparkles,
    title: "AI analyzes your skin",
    description: "Our model scans the image for skin conditions and concerns.",
  },
  {
    icon: FileText,
    title: "Get your results",
    description: "See a detailed breakdown with personalized recommendations.",
  },
];

export default function Scan() {
  const focusTrigger = useFocusTrigger();
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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-50">
      <View className="flex-1 px-6">
        <FadeInView delay={0} triggerKey={focusTrigger}>
          <Text className="font-bold text-green-700 text-2xl">Skin Scan</Text>
          <Text className="text-gray-500">Analyze your skin with a photo</Text>
        </FadeInView>

        <FadeInView delay={100} triggerKey={focusTrigger}>
          <View className="flex-col gap-3 mt-6">
            <Pressable
              onPress={() => router.push("/(modules)/camera")}
              className="bg-white rounded-xl border border-gray-100 py-4 px-4 flex-row items-center gap-3"
            >
              <View className="h-12 w-12 rounded-full items-center justify-center bg-green-100">
                <Camera size={22} color="#15803D" />
              </View>
              <View className="flex-col flex-1 gap-1">
                <Text className="font-bold text-gray-900">Use Camera</Text>
                <Text className="text-xs text-gray-500">
                  Take a new photo for analysis
                </Text>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={handleUploadPhoto}
              className="bg-white rounded-xl border border-gray-100 py-4 px-4 flex-row items-center gap-3"
            >
              <View className="h-12 w-12 rounded-full items-center justify-center bg-green-100">
                <Images size={22} color="#15803D" />
              </View>
              <View className="flex-col flex-1 gap-1">
                <Text className="font-bold text-gray-900">Upload Photo</Text>
                <Text className="text-xs text-gray-500">
                  Choose an existing photo from your gallery
                </Text>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </Pressable>
          </View>
        </FadeInView>

        {/* How it works */}
        <FadeInView delay={200} triggerKey={focusTrigger}>
          <View className="mt-8 gap-3">
            <Text className="font-bold text-gray-800 text-lg">How It Works</Text>
            {HOW_IT_WORKS.map((item, index) => (
              <View
                key={item.title}
                className="bg-white rounded-xl border border-gray-100 py-4 px-4 flex-row items-start gap-3"
              >
                <View className="h-8 w-8 rounded-full items-center justify-center mt-0.5 bg-green-100">
                  <Text className="text-green-700 font-bold">{index + 1}</Text>
                </View>
                <View className="flex-col flex-1 gap-1">
                  <View className="flex-row items-center gap-1.5">
                    <item.icon size={14} color="#15803D" />
                    <Text className="font-bold text-gray-900">{item.title}</Text>
                  </View>
                  <Text className="text-xs text-gray-500">
                    {item.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </FadeInView>

        <FadeInView delay={300} triggerKey={focusTrigger}>
          <View className="bg-amber-50 rounded-xl py-4 px-4 flex-row items-start gap-3 mt-6 mb-6">
            <AlertTriangle size={20} color="#B45309" />
            <Text className="text-xs text-amber-800 flex-1">
              This app does not replace a dermatologist and is not a medical
              diagnosis. If you notice unusual, painful, or rapidly changing skin
              conditions, please consult a doctor or visit a hospital.
            </Text>
          </View>
        </FadeInView>
      </View>
    </SafeAreaView>
  );
}
