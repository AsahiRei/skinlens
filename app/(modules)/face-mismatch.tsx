import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScanFace, Camera, RefreshCw } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ClinicalCard, IconBadge, PrimaryButton, SecondaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import { ScreenGradient } from "@/components/ScreenGradient";

export default function FaceMismatch() {
  const router = useRouter();
  const { similarity } = useLocalSearchParams<{ similarity?: string }>();
  const pct =
    similarity !== undefined && similarity !== ""
      ? Math.round(Number(similarity) * 100)
      : null;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <View className="flex-1 px-5 items-center justify-center">
        <ClinicalCard className="py-10 px-6 items-center gap-3 w-full">
          <IconBadge icon={ScanFace} size="lg" tone="warning" />
          <Text className="font-bold text-2xl text-center" style={{ color: theme.colors.ink }}>
            Face Not Matched
          </Text>
          <Text className="text-sm text-center leading-5" style={{ color: theme.colors.muted }}>
            This face doesn&apos;t match the one enrolled on this account, so
            the scan can&apos;t continue to the survey. Try again in good
            lighting, looking straight at the camera.
          </Text>
          {pct !== null && Number.isFinite(pct) && (
            <View className="rounded-full px-4 py-2" style={{ backgroundColor: theme.colors.background }}>
              <Text className="text-xs font-semibold" style={{ color: theme.colors.muted }}>
                Match score: {pct}%
              </Text>
            </View>
          )}
          <View className="w-full mt-2">
            <PrimaryButton
              label="Retry Scan"
              icon={Camera}
              onPress={() => router.replace("/(modules)/camera")}
            />
          </View>
          <View className="w-full">
            <SecondaryButton
              label="Update My Face"
              icon={RefreshCw}
              onPress={() =>
                router.replace({
                  pathname: "/(user-setup)/face-enroll",
                  params: { mode: "reenroll" },
                })
              }
            />
          </View>
          <Pressable onPress={() => router.back()} className="active:opacity-70 mt-1">
            <Text className="text-sm font-semibold" style={{ color: theme.colors.faint }}>Go Back</Text>
          </Pressable>
        </ClinicalCard>
      </View>
    </SafeAreaView>
  );
}
