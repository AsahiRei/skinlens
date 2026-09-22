import { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, Check } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import InlineProgress from "@/components/InlineProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { classifyImage, enhanceImage } from "@/utils/skin-prediction";
import type { ClassificationResult } from "@/types/skin";

const steps = [
  { label: "Analyzing skin image" },
  { label: "Running AI detection" },
  { label: "Preparing results" },
];

const ANGLE_LABELS = ["Front", "Left", "Right"];

export default function Analyzing() {
  const router = useRouter();
  const { imageUri, sourceType, imageUris } = useLocalSearchParams<{
    imageUri: string;
    sourceType: string;
    imageUris?: string;
  }>();
  const [stepIndex, setStepIndex] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [displayUris, setDisplayUris] = useState<(string | null)[]>([null, null, null]);
  const ranRef = useRef(false);

  const multiAngles: string[] = imageUris ? JSON.parse(imageUris) : [];
  const isMulti = multiAngles.length > 1;

  const scanLineY = useSharedValue(0);

  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, {
        duration: 1800,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, []);

  const scanLineStyle = useAnimatedStyle(() => ({
    top: `${scanLineY.value * 100}%`,
  }));

  const goToStep = (i: number) => {
    setStepIndex(i);
    setProgressPct(Math.round(((i + 1) / steps.length) * 100));
  };

  const aggregateResults = (results: ClassificationResult[]): ClassificationResult => {
    const avgProbabilities: Record<string, number> = {};
    const labels = Object.keys(results[0].probabilities);
    labels.forEach((label) => {
      avgProbabilities[label] =
        results.reduce((sum, r) => sum + (r.probabilities[label] ?? 0), 0) / results.length;
    });
    let bestLabel = labels[0];
    let bestConf = 0;
    Object.entries(avgProbabilities).forEach(([label, conf]) => {
      if (conf > bestConf) {
        bestLabel = label;
        bestConf = conf;
      }
    });
    return { label: bestLabel, confidence: bestConf, probabilities: avgProbabilities };
  };

  const run = async () => {
    try {
      setError(null);
      const uris = isMulti ? multiAngles : [imageUri];
      if (!uris[0]) {
        setError("No image provided. Please go back and try again.");
        return;
      }

      goToStep(0);

      if (isMulti) {
        const enhanced = await Promise.all(
          uris.map((uri) => enhanceImage(uri)),
        );
        setDisplayUris(enhanced);
      } else {
        const enhanced = await enhanceImage(uris[0]);
        setDisplayUris([enhanced]);
      }
      await new Promise((r) => setTimeout(r, 600));

      goToStep(1);
      const results = await Promise.all(
        uris.map((uri) => classifyImage(uri)),
      );

      const finalResult = isMulti ? aggregateResults(results) : results[0];

      goToStep(2);
      await new Promise((r) => setTimeout(r, 400));

      router.replace({
        pathname: "/(modules)/survey",
        params: {
          imageUri: uris[0],
          sourceType: sourceType ?? "gallery",
          label: finalResult.label,
          confidence: String(finalResult.confidence),
          probabilities: JSON.stringify(finalResult.probabilities),
        },
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to analyze the image. Please try again.",
      );
    }
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    run();
  }, []);

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 px-6 items-center justify-center">
          <View className="bg-white rounded-xl border border-gray-100 py-10 px-6 items-center gap-2 w-full">
            <AlertCircle size={28} color="#B91C1C" />
            <Text className="font-bold text-gray-800">Analysis failed</Text>
            <Text className="text-sm text-gray-500 text-center">{error}</Text>
            <Pressable
              className="rounded-full bg-green-700 active:opacity-80 px-6 py-3 mt-2"
              onPress={() => {
                ranRef.current = false;
                run();
              }}
            >
              <Text className="font-bold text-white">Try Again</Text>
            </Pressable>
            <Pressable
              className="rounded-full border border-green-700 active:opacity-80 px-6 py-3 mt-1"
              onPress={() => router.back()}
            >
              <Text className="font-bold text-green-700">Go Back</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 px-6">
        <View className="flex-1 items-center justify-center gap-8">
          {/* Image(s) with scanning line */}
          {isMulti ? (
            <View className="flex-row items-center justify-center gap-3">
              {multiAngles.map((uri, i) => (
                <View key={i} className="relative items-center">
                  <View
                    className="w-[100px] h-[130px] rounded-2xl overflow-hidden bg-gray-200"
                    style={{ elevation: 6 }}
                  >
                    {(displayUris[i] ?? uri) && (
                      <Image
                        source={{ uri: displayUris[i] ?? uri }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    )}
                    {/* Scanning line overlay */}
                    <Animated.View
                      style={scanLineStyle}
                      className="absolute left-0 right-0"
                      pointerEvents="none"
                    >
                      <View
                        style={{
                          height: 2,
                          backgroundColor: "#15803D",
                          shadowColor: "#15803D",
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.8,
                          shadowRadius: 6,
                          elevation: 3,
                        }}
                      />
                    </Animated.View>
                    {/* Corner brackets */}
                    <View className="absolute top-2 left-2">
                      <View style={{ width: 14, height: 14, borderTopWidth: 2, borderLeftWidth: 2, borderColor: "#15803D" }} />
                    </View>
                    <View className="absolute top-2 right-2">
                      <View style={{ width: 14, height: 14, borderTopWidth: 2, borderRightWidth: 2, borderColor: "#15803D" }} />
                    </View>
                    <View className="absolute bottom-2 left-2">
                      <View style={{ width: 14, height: 14, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: "#15803D" }} />
                    </View>
                    <View className="absolute bottom-2 right-2">
                      <View style={{ width: 14, height: 14, borderBottomWidth: 2, borderRightWidth: 2, borderColor: "#15803D" }} />
                    </View>
                  </View>
                  <Text className="text-xs font-semibold text-green-700 mt-2">
                    {ANGLE_LABELS[i]}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="relative items-center justify-center">
              <View
                className="w-64 h-64 rounded-3xl overflow-hidden bg-gray-200"
                style={{ elevation: 8 }}
              >
                {(displayUris[0] ?? imageUri) && (
                  <Image
                    source={{ uri: displayUris[0] ?? imageUri! }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                )}
                {/* Scanning line overlay */}
                <Animated.View
                  style={scanLineStyle}
                  className="absolute left-0 right-0"
                  pointerEvents="none"
                >
                  <View
                    style={{
                      height: 3,
                      backgroundColor: "#15803D",
                      shadowColor: "#15803D",
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.8,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  />
                  <View
                    style={{
                      height: 40,
                      bottom: 0,
                      position: "absolute",
                      left: 0,
                      right: 0,
                      backgroundColor: "rgba(21, 128, 61, 0.08)",
                    }}
                  />
                </Animated.View>
                {/* Corner brackets */}
                <View className="absolute top-3 left-3">
                  <View style={{ width: 20, height: 20, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#15803D" }} />
                </View>
                <View className="absolute top-3 right-3">
                  <View style={{ width: 20, height: 20, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#15803D" }} />
                </View>
                <View className="absolute bottom-3 left-3">
                  <View style={{ width: 20, height: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#15803D" }} />
                </View>
                <View className="absolute bottom-3 right-3">
                  <View style={{ width: 20, height: 20, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#15803D" }} />
                </View>
              </View>
            </View>
          )}

          <View className="pt-2">
            <Text className="font-bold text-green-700 text-2xl text-center">
              Scanning Your Skin
            </Text>
            <Text className="text-gray-500 text-center">
              {isMulti
                ? `Analyzing ${multiAngles.length} angles for better accuracy`
                : "AI-powered skin analysis in progress"}
            </Text>
          </View>

          <View className="w-full gap-3">
            <Text className="text-center text-base font-medium text-gray-700">
              {steps[stepIndex].label}...
            </Text>
            <InlineProgress progress={progressPct} height={8} color="#15803D" />
          </View>

          <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 w-full gap-3">
            {steps.map((step, i) => {
              const isDone = i < stepIndex;
              const isActive = i === stepIndex;
              return (
                <View key={step.label} className="flex-row items-center gap-3">
                  <View
                    className={`h-7 w-7 rounded-full items-center justify-center ${
                      isDone
                        ? "bg-green-700"
                        : isActive
                          ? "bg-green-100"
                          : "bg-gray-100"
                    }`}
                  >
                    {isDone ? (
                      <Check size={14} color="#FFFFFF" />
                    ) : (
                      <Text
                        className={`text-xs font-bold ${
                          isActive ? "text-green-700" : "text-gray-400"
                        }`}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    className={`text-sm ${
                      isDone
                        ? "text-gray-800 line-through"
                        : isActive
                          ? "font-bold text-gray-900"
                          : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
