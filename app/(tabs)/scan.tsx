import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Images,
  ArrowRight,
  AlertTriangle,
  ImagePlus,
} from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  ClinicalCard,
  GradientHeroCta,
  Notice,
  ScreenHeader,
  SectionTitle,
  UiModal,
} from "@/components/ui";
import scanContent from "@/data/scan-content.json";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import { ScreenGradient } from "@/components/ScreenGradient";

const DISCLAIMER = scanContent.disclaimer;

export default function Scan() {
  const router = useRouter();
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  const handleUploadPhoto = async () => {
    console.log(`[SkinLens][Scan] ${new Date().toISOString()} upload start`);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      console.log(`[SkinLens][Scan] ${new Date().toISOString()} gallery permission denied`);
      setNotice({
        title: "Permission needed",
        message: "Please allow photo library access to upload an image.",
      });
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: true,
        aspect: [1, 1],
      });
      console.log(`[SkinLens][Scan] ${new Date().toISOString()} picker canceled=`, result.canceled, `assets=`, result.canceled ? 0 : (result.assets?.length ?? 0));
      if (!result.canceled && result.assets?.[0]?.uri) {
        console.log(`[SkinLens][Scan] ${new Date().toISOString()} navigating to analyzing`);
        router.push({
          pathname: "/(modules)/analyzing",
          params: { imageUri: result.assets[0].uri, sourceType: "gallery" },
        });
      }
    } catch (err) {
      console.log(`[SkinLens][Scan] ${new Date().toISOString()} gallery open failed:`, err);
      setNotice({
        title: "Couldn't open gallery",
        message: "Please try again or use the camera instead.",
      });
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <UiModal
        visible={notice !== null}
        onDismiss={() => setNotice(null)}
        title={notice?.title ?? ""}
        message={notice?.message}
        icon={notice?.title === "Permission needed" ? AlertTriangle : ImagePlus}
        tone="warning"
        actions={[{ label: "Got it", onPress: () => setNotice(null) }]}
      />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: TAB_BAR_CLEARANCE }}
      >
        <FadeItem index={0}>
          <ScreenHeader
            title="Skin Scan"
            subtitle="Take a face photo or upload one"
          />
        </FadeItem>

        {/* Action buttons */}
        <FadeItem index={1}>
          <View className="flex-col gap-3 mt-5">
            <GradientHeroCta
              className="mt-0"
              icon={Camera}
              title="Use Camera"
              subtitle="Guided face photo to check your skin"
              onPress={() => router.push("/(modules)/camera")}
              accessibilityLabel="Use camera"
              accessory={
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  <ArrowRight size={16} color="white" />
                </View>
              }
            />

            <GradientHeroCta
              className="mt-0"
              icon={Images}
              title="Upload Photo"
              subtitle="Choose from your gallery"
              onPress={handleUploadPhoto}
              accessibilityLabel="Upload photo"
              accessory={
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  <ArrowRight size={16} color="white" />
                </View>
              }
            />
          </View>
        </FadeItem>

        {/* How it works */}
        <FadeItem index={2}>
          <View className="mt-7">
            <SectionTitle title="How it works" meta={`${scanContent.howItWorks.length} steps`} />
            <ClinicalCard className="mt-3 !p-0 overflow-hidden">
              {scanContent.howItWorks.map((item, index) => (
                <View
                  key={item.title}
                  className="py-4 px-4 flex-row items-start gap-3"
                  style={index < scanContent.howItWorks.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#EEF2EF" } : {}}
                >
                  <View className="h-7 w-7 rounded-full items-center justify-center mt-0.5" style={{ backgroundColor: "#15803D" }}>
                    <Text className="text-white font-bold text-xs">{index + 1}</Text>
                  </View>
                  <View className="flex-col flex-1 gap-0.5">
                    <Text className="font-bold text-[14px]" style={{ color: "#10241A" }}>{item.title}</Text>
                    <Text className="text-xs" style={{ color: "#6B7280" }}>{item.description}</Text>
                  </View>
                </View>
              ))}
            </ClinicalCard>
          </View>
        </FadeItem>

        {/* Capture tips */}
        <FadeItem index={3}>
          <View className="mt-6">
            <SectionTitle title="Tips for best results" />
            <ClinicalCard className="mt-3 !p-0 overflow-hidden" >
              <View style={{ backgroundColor: "#EAF6EE", borderRadius: 20 }}>
              {scanContent.captureTips.map((item, index) => (
                <View
                  key={item.title}
                  className="py-3 px-4 flex-col gap-0.5"
                  style={index < scanContent.captureTips.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#D8EADD" } : {}}
                >
                  <Text className="font-bold text-[14px]" style={{ color: "#10241A" }}>{item.title}</Text>
                  <Text className="text-xs" style={{ color: "#3F4A44" }}>{item.description}</Text>
                </View>
              ))}
              </View>
            </ClinicalCard>
          </View>
        </FadeItem>

        {/* Disclaimer */}
        <FadeItem index={4}>
          <View className="mt-5">
            <Notice icon={AlertTriangle} copy={DISCLAIMER} tone="warning" />
          </View>
        </FadeItem>
      </ScrollView>
    </SafeAreaView>
  );
}
