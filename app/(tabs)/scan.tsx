import { useCallback, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
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
import { theme } from "@/lib/theme";
import { ScreenGradient } from "@/components/ScreenGradient";
import { blocksCapture, measureImageLighting } from "@/utils/lighting";

const DISCLAIMER = scanContent.disclaimer;

export default function Scan() {
  const router = useRouter();
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  // Gallery photos get the same pixel-based lighting verdict as camera
  // captures — but the patient can override it (their photo, their call).
  const [checkingPhoto, setCheckingPhoto] = useState(false);
  const [lightingWarning, setLightingWarning] = useState<{
    message: string;
    uri: string;
  } | null>(null);
  // Re-entry / navigation guards: a double tap opened the picker twice (two
  // lighting checks) and stacked a second camera screen.
  const pickingRef = useRef(false);
  const navRef = useRef(false);

  // Focus reset: Expo Router keeps tab screens mounted, so without this the
  // nav guard stays true forever after the first push — "Use Camera" would
  // never open the camera again while "Upload Photo" (which doesn't check
  // navRef) kept working.
  useFocusEffect(
    useCallback(() => {
      navRef.current = false;
    }, []),
  );

  const goToAnalyzing = (uri: string) => {
    if (navRef.current) return;
    navRef.current = true;
    router.push({
      pathname: "/(modules)/analyzing",
      params: { imageUri: uri, sourceType: "gallery" },
    });
  };

  const handleUploadPhoto = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: true,
        aspect: [1, 1],
      });
      console.log(`[SkinLens][Scan] ${new Date().toISOString()} picker canceled=`, result.canceled, `assets=`, result.canceled ? 0 : (result.assets?.length ?? 0));
      if (!result.canceled && result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        setCheckingPhoto(true);
        const verdict = await measureImageLighting(uri);
        setCheckingPhoto(false);
        if (verdict && blocksCapture(verdict.quality)) {
          console.log(`[SkinLens][Scan] ${new Date().toISOString()} gallery lighting blocked quality=`, verdict.quality);
          setLightingWarning({ message: verdict.message, uri });
          return;
        }
        console.log(`[SkinLens][Scan] ${new Date().toISOString()} navigating to analyzing`);
        goToAnalyzing(uri);
      }
    } catch (err) {
      console.log(`[SkinLens][Scan] ${new Date().toISOString()} gallery open failed:`, err);
      setCheckingPhoto(false);
      setNotice({
        title: "Couldn't open gallery",
        message: "Please try again or use the camera instead.",
      });
    } finally {
      pickingRef.current = false;
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
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
      <UiModal
        visible={checkingPhoto}
        onDismiss={() => {}}
        title="Checking the light"
        message="Reviewing your photo before the scan…"
        tone="soft"
        dismissOnBackdrop={false}
        actions={[]}
      />
      <UiModal
        visible={lightingWarning !== null}
        onDismiss={() => setLightingWarning(null)}
        title="Lighting looks off"
        message={
          lightingWarning
            ? `${lightingWarning.message}. Scans are most accurate in even light — you can pick another photo or continue anyway.`
            : undefined
        }
        icon={AlertTriangle}
        tone="warning"
        actions={[
          {
            label: "Pick another photo",
            kind: "secondary",
            onPress: () => {
              setLightingWarning(null);
              void handleUploadPhoto();
            },
          },
          {
            label: "Continue anyway",
            kind: "primary",
            onPress: () => {
              const uri = lightingWarning?.uri;
              setLightingWarning(null);
              if (uri) goToAnalyzing(uri);
            },
          },
        ]}
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
              onPress={() => {
                if (navRef.current) return;
                navRef.current = true;
                router.push("/(modules)/camera");
              }}
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
              disabled={checkingPhoto}
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
                  style={index < scanContent.howItWorks.length - 1 ? { borderBottomWidth: 1, borderBottomColor: theme.colors.divider } : {}}
                >
                  <View className="h-7 w-7 rounded-full items-center justify-center mt-0.5" style={{ backgroundColor: theme.colors.primary }}>
                    <Text className="text-white font-bold text-xs">{index + 1}</Text>
                  </View>
                  <View className="flex-col flex-1 gap-0.5">
                    <Text className="font-bold text-[14px]" style={{ color: theme.colors.ink }}>{item.title}</Text>
                    <Text className="text-xs" style={{ color: theme.colors.muted }}>{item.description}</Text>
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
              <View style={{ backgroundColor: theme.colors.primarySoft, borderRadius: 20 }}>
              {scanContent.captureTips.map((item, index) => (
                <View
                  key={item.title}
                  className="py-3 px-4 flex-col gap-0.5"
                  style={index < scanContent.captureTips.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#D8EADD" } : {}}
                >
                  <Text className="font-bold text-[14px]" style={{ color: theme.colors.ink }}>{item.title}</Text>
                  <Text className="text-xs" style={{ color: theme.colors.body }}>{item.description}</Text>
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
