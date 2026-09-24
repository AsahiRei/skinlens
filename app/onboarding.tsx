import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import PagerView from "react-native-pager-view";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowRight, Download, AlertCircle } from "lucide-react-native";
import { useRouter } from "expo-router";

import InlineProgress from "@/components/InlineProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import onboardingPage from "@/data/onboarding.json";
import { cancelDownload, getModelPath, getSelectedModel } from "@/utils/llama";

export default function Onboarding() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"downloading" | "error">("downloading");
  const [errorMessage, setErrorMessage] = useState("");
  const [modelLabel, setModelLabel] = useState("");
  const router = useRouter();
  const downloadingRef = useRef(false);

  // Abort the model download if the screen unmounts mid-download.
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
        await getModelPath((fraction) => {
          setProgress(Math.round(fraction * 100));
        });
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
    setProgress(0);
    setErrorMessage("");
    try {
      await getModelPath((fraction) => {
        setProgress(Math.round(fraction * 100));
      });
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
    <SafeAreaView className="flex-1 bg-white">
      {!downloading && (
        <View className="mb-6 flex-row items-center justify-center gap-2 px-6">
          {onboardingPage.map((_, index) => (
            <View
              key={index}
              className={`h-2 flex-1 rounded-full ${
                page === index ? "bg-green-700" : "bg-gray-300"
              }`}
            />
          ))}
        </View>
      )}

      {downloading ? (
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <View className="h-14 w-14 rounded-full bg-green-100 items-center justify-center">
            <Download size={28} color="#15803D" />
          </View>
          <Text className="text-center text-xl font-bold text-green-700">
            Downloading AI Model
          </Text>
          <Text className="text-center text-gray-500 text-sm">
            {modelLabel
              ? `${modelLabel} is required for skin analysis. This may take a few minutes on first download.`
              : "The AI model is required for skin analysis. This may take a few minutes on first download."}
          </Text>

          {status === "downloading" ? (
            <View className="w-full gap-2">
              <InlineProgress
                progress={progress}
                height={8}
                color="#15803D"
              />
              <Text className="text-center text-sm font-medium text-gray-600">
                {progress}%
              </Text>
            </View>
          ) : (
            <View className="w-full items-center gap-2">
              <View className="flex-row items-center gap-2">
                <AlertCircle size={18} color="#B91C1C" />
                <Text className="text-sm text-red-600">{errorMessage}</Text>
              </View>
              <Pressable
                className="rounded-full bg-green-700 active:opacity-80 py-3 w-full mt-2"
                onPress={handleRetry}
              >
                <Text className="font-bold text-white text-center">Retry</Text>
              </Pressable>
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
            {onboardingPage.map((item, index) => (
              <View key={index} className="items-center justify-center px-6">
                <Text className="text-3xl font-bold text-center text-green-700">
                  {item.title}
                </Text>
                <Text className="mt-3 text-center text-gray-600">
                  {item.description}
                </Text>
              </View>
            ))}
          </PagerView>
          <View className="mx-6 mb-8">
            <Pressable
              className="rounded-full bg-green-700 active:opacity-80 p-4"
              onPress={handleNext}
            >
              <View className="flex-row items-center justify-center gap-1">
                <Text className="font-bold text-white">
                  {page === onboardingPage.length - 1
                    ? "Get Started"
                    : "Next"}
                </Text>
                {page !== onboardingPage.length - 1 && (
                  <ArrowRight size={16} color="white" />
                )}
              </View>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
