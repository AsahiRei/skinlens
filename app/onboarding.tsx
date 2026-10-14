import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import PagerView from "react-native-pager-view";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowRight, Download, AlertCircle } from "lucide-react-native";
import { useRouter } from "expo-router";

import InlineProgress from "@/components/InlineProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { PrimaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import onboardingPage from "@/data/onboarding.json";
import { cancelDownload, getModelDownloadState, getModelPath, getSelectedModel } from "@/utils/llama";

export default function Onboarding() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedMB, setDownloadedMB] = useState(0);
  const [totalMB, setTotalMB] = useState(0);
  const [status, setStatus] = useState<"downloading" | "error">("downloading");
  const [errorMessage, setErrorMessage] = useState("");
  const [modelLabel, setModelLabel] = useState("");
  const router = useRouter();
  const downloadingRef = useRef(false);

  const reportProgress = (fraction: number, bytesWritten?: number, totalBytes?: number) => {
    setProgress(Math.round(fraction * 100));
    if (typeof bytesWritten === "number" && bytesWritten >= 0) {
      setDownloadedMB(bytesWritten / (1024 * 1024));
    }
    if (typeof totalBytes === "number" && totalBytes > 0) {
      setTotalMB(totalBytes / (1024 * 1024));
    }
  };

  // Seed the progress bar from the persisted download cache so reopening
  // the app mid-download shows e.g. 35% instead of resetting to 0%.
  useEffect(() => {
    getModelDownloadState()
      .then((s) => {
        setProgress(Math.round(s.fraction * 100));
        setDownloadedMB(s.bytesWritten / (1024 * 1024));
        if (s.totalBytes > 0) setTotalMB(s.totalBytes / (1024 * 1024));
      })
      .catch(() => {});
  }, []);

  // Persist the native pause state if the screen unmounts mid-download so
  // the next launch resumes instead of restarting from zero.
  useEffect(() => {
    return () => {
      if (downloadingRef.current) {
        void cancelDownload();
      }
    };
  }, []);

  const handleNext = async () => {
    if (page < onboardingPage.length - 1) {
      pagerRef.current?.setPage(page + 1);
    } else {
      // Guard against double-taps starting two concurrent downloads.
      if (downloadingRef.current) return;
      downloadingRef.current = true;
      setDownloading(true);
      try {
        const model = await getSelectedModel();
        setModelLabel(model.label);
        await getModelPath(reportProgress);
        await AsyncStorage.setItem("is_onboarded", "true");
        router.replace("/welcome");
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Download failed. Please try again.",
        );
      } finally {
        downloadingRef.current = false;
      }
    }
  };

  const handleRetry = async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setStatus("downloading");
    // Resume from the cached byte offset instead of restarting at 0%.
    try {
      const cached = await getModelDownloadState();
      setProgress(Math.round(cached.fraction * 100));
      setDownloadedMB(cached.bytesWritten / (1024 * 1024));
      if (cached.totalBytes > 0) setTotalMB(cached.totalBytes / (1024 * 1024));
    } catch {
      setProgress(0);
    }
    setErrorMessage("");
    try {
      await getModelPath(reportProgress);
      await AsyncStorage.setItem("is_onboarded", "true");
      router.replace("/welcome");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Download failed. Please try again.",
      );
    } finally {
      downloadingRef.current = false;
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      {!downloading && (
        <View className="mb-6 flex-row items-center justify-center gap-1.5 px-6 mt-2">
          {onboardingPage.map((_, index) => (
            <View
              key={index}
              className={`h-1.5 rounded-full ${
                page === index ? "w-6 bg-[#14532D]" : "w-1.5 bg-gray-200"
              }`}
            />
          ))}
        </View>
      )}

      {downloading ? (
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <View className="h-14 w-14 rounded-full items-center justify-center" style={{ backgroundColor: "#EAF6EE" }}>
            <Download size={28} color="#15803D" />
          </View>
          <Text className="text-center text-xl font-bold" style={{ color: "#10241A" }}>
            Downloading Model
          </Text>
          <Text className="text-center text-sm" style={{ color: "#6B7280" }}>
            {modelLabel
              ? `${modelLabel} is needed for skin analysis. This may take a few minutes on first download.`
              : "The model is needed for skin analysis. This may take a few minutes on first download."}
          </Text>

          {status === "downloading" ? (
            <View className="w-full gap-2">
              <InlineProgress
                progress={progress}
                height={8}
                color="#15803D"
                trackColor="#EAF6EE"
              />
              <Text className="text-center text-sm font-medium" style={{ color: "#3F4A44" }}>
                {totalMB > 0
                  ? `${progress}% (${downloadedMB.toFixed(0)} / ${totalMB.toFixed(0)} MB)`
                  : `${progress}%`}
              </Text>
            </View>
          ) : (
            <View className="w-full items-center gap-2">
              <View className="flex-row items-center gap-2">
                <AlertCircle size={18} color="#DC2626" />
                <Text className="text-sm" style={{ color: "#DC2626" }}>{errorMessage}</Text>
              </View>
              <View className="w-full mt-2">
                <PrimaryButton label="Retry" onPress={handleRetry} />
              </View>
            </View>
          )}
        </View>
      ) : (
        <>
          <PagerView
            style={{ flex: 1 }}
            ref={pagerRef}
            initialPage={0}
            onPageSelected={(event) => {
              setPage(event.nativeEvent.position);
            }}
          >
            {onboardingPage.map((item, index) => {
              return (
              <View key={index} className="items-center justify-center px-8">
                <Text className="text-[28px] font-bold text-center mt-2" style={{ color: "#10241A" }}>
                  {item.title}
                </Text>
                <Text className="mt-3 text-center text-[15px] leading-6" style={{ color: "#6B7280" }}>
                  {item.description}
                </Text>
              </View>
              );
            })}
          </PagerView>
          <View className="mx-6 mb-8">
            <PrimaryButton
              label={
                page === onboardingPage.length - 1 ? "Get Started" : "Next"
              }
              onPress={handleNext}
              icon={page !== onboardingPage.length - 1 ? ArrowRight : undefined}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
