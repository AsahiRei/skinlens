import { useEffect, useRef, useState } from "react";
import { View, Image, useWindowDimensions } from "react-native";
import { Text } from "@/components/Text";
import PagerView from "react-native-pager-view";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AlertCircle } from "lucide-react-native";
import { useRouter } from "expo-router";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import InlineProgress from "@/components/InlineProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { PrimaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import onboardingPage from "@/data/onboarding.json";
import {
  cancelDownload,
  getModelDownloadState,
  getModelPath,
} from "@/utils/llama";

const onboardingImages = {
  skin: require("@/assets/images/onboarding/1.png"),
  camera: require("@/assets/images/onboarding/2.png"),
  insights: require("@/assets/images/onboarding/3.png"),
  tracking: require("@/assets/images/onboarding/4.png"),
};

const downloadingImage = require("@/assets/images/onboarding/5.png");

type OnboardingItem = (typeof onboardingPage)[number];

/**
 * A single onboarding slide whose content is driven by the pager's continuous
 * scroll position (page index + offset). Because it is scroll-driven rather
 * than press-driven, tapping "Next" and swiping produce the exact same motion,
 * and the animation tracks the finger mid-swipe.
 *
 * `distance` is how far this slide is from the centre: -1 (one page to the
 * right, incoming), 0 (focused), 1 (one page to the left, outgoing).
 */
function OnboardingSlide({
  item,
  index,
  scroll,
  width,
  reduceMotion,
}: {
  item: OnboardingItem;
  index: number;
  scroll: SharedValue<number>;
  width: number;
  reduceMotion: boolean;
}) {
  const range = [index - 1, index, index + 1];

  // Each layer lags the page by a different amount -> parallax depth.
  // Image lags the most and shrinks slightly; text layers trail behind it.
  const imageStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scroll.value, range, [0, 1, 0], Extrapolation.CLAMP);
    if (reduceMotion) return { opacity };
    return {
      opacity,
      transform: [
        {
          translateX: interpolate(
            scroll.value,
            range,
            [-width * 0.45, 0, width * 0.45],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(scroll.value, range, [0.7, 1, 0.7], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const titleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scroll.value, range, [0, 1, 0], Extrapolation.CLAMP);
    if (reduceMotion) return { opacity };
    return {
      opacity,
      transform: [
        {
          translateX: interpolate(
            scroll.value,
            range,
            [-width * 0.25, 0, width * 0.25],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const descriptionStyle = useAnimatedStyle(() => {
    // Description fades faster so it reads as the "last" layer to arrive.
    const opacity = interpolate(
      scroll.value,
      [index - 0.6, index, index + 0.6],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    if (reduceMotion) return { opacity };
    return {
      opacity,
      transform: [
        {
          translateX: interpolate(
            scroll.value,
            range,
            [-width * 0.12, 0, width * 0.12],
            Extrapolation.CLAMP,
          ),
        },
        {
          translateY: interpolate(scroll.value, range, [16, 0, 16], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    <View className="items-center justify-center px-8">
      <Animated.View style={imageStyle}>
        <Image
          source={onboardingImages[item.image as keyof typeof onboardingImages]}
          style={{ width: 400, height: 400 }}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.View style={titleStyle}>
        <Text
          className="text-[28px] font-bold text-center mt-2"
          style={{ color: "#10241A" }}
        >
          {item.title}
        </Text>
      </Animated.View>
      <Animated.View style={descriptionStyle}>
        <Text
          className="mt-3 text-center text-[15px] leading-6"
          style={{ color: "#6B7280" }}
        >
          {item.description}
        </Text>
      </Animated.View>
    </View>
  );
}

/** Page indicator dot that stretches into a pill as its page comes into focus. */
function PageDot({ index, scroll }: { index: number; scroll: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const range = [index - 1, index, index + 1];
    return {
      width: interpolate(scroll.value, range, [6, 24, 6], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(
        Math.min(Math.abs(scroll.value - index), 1),
        [0, 1],
        ["#14532D", "#E5E7EB"],
      ),
    };
  });
  return <Animated.View className="h-1.5 rounded-full" style={style} />;
}

export default function Onboarding() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedMB, setDownloadedMB] = useState(0);
  const [totalMB, setTotalMB] = useState(0);
  const [status, setStatus] = useState<"downloading" | "error">("downloading");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const downloadingRef = useRef(false);
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  // Continuous pager position (e.g. 1.35 = 35% of the way from page 1 to 2).
  // Drives every slide/indicator animation so swipe and "Next" stay in sync.
  const scroll = useSharedValue(0);

  // Gentle looping bounce for the mascot on the download screen.
  const bounceY = useSharedValue(0);

  useEffect(() => {
    bounceY.value = withRepeat(
      withSequence(
        withTiming(-14, { duration: 750, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 750, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [bounceY]);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));

  const reportProgress = (
    fraction: number,
    bytesWritten?: number,
    totalBytes?: number,
  ) => {
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
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: theme.colors.background }}
    >
      <ScreenGradient />
      {!downloading && (
        <View className="mb-6 flex-row items-center justify-center gap-1.5 px-6 mt-2">
          {onboardingPage.map((_, index) => (
            <PageDot key={index} index={index} scroll={scroll} />
          ))}
        </View>
      )}

      {downloading ? (
        <Animated.View
          entering={FadeIn.duration(400)}
          className="flex-1 items-center justify-center px-6 gap-4"
        >
          <Animated.View style={bounceStyle}>
            <Image
              source={downloadingImage}
              style={{ width: 150, height: 250 }}
              resizeMode="contain"
            />
          </Animated.View>
          <Text
            className="text-center text-xl font-bold"
            style={{ color: "#10241A" }}
          >
            Downloading Resources
          </Text>
          <Text className="text-center text-sm" style={{ color: "#6B7280" }}>
            Resources are needed for skin analysis. This may take a few minutes
            on first download.
          </Text>

          {status === "downloading" ? (
            <View className="w-full gap-2">
              <InlineProgress
                progress={progress}
                height={8}
                color="#214E36"
                trackColor="#EAF6EE"
              />
              <Text
                className="text-center text-sm font-medium"
                style={{ color: "#3F4A44" }}
              >
                {totalMB > 0
                  ? `${progress}% (${downloadedMB.toFixed(0)} / ${totalMB.toFixed(0)} MB)`
                  : `${progress}%`}
              </Text>
            </View>
          ) : (
            <View className="w-full items-center gap-2">
              <View className="flex-row items-center gap-2">
                <AlertCircle size={18} color="#DC2626" />
                <Text className="text-sm" style={{ color: "#DC2626" }}>
                  {errorMessage}
                </Text>
              </View>
              <View className="w-full mt-2">
                <PrimaryButton label="Retry" onPress={handleRetry} />
              </View>
            </View>
          )}
        </Animated.View>
      ) : (
        <>
          <PagerView
            style={{ flex: 1 }}
            ref={pagerRef}
            initialPage={0}
            onPageScroll={(event) => {
              const { position, offset } = event.nativeEvent;
              scroll.value = position + offset;
            }}
            onPageSelected={(event) => {
              setPage(event.nativeEvent.position);
            }}
          >
            {onboardingPage.map((item, index) => (
              <OnboardingSlide
                key={index}
                item={item}
                index={index}
                scroll={scroll}
                width={width}
                reduceMotion={reduceMotion}
              />
            ))}
          </PagerView>
          <View className="mx-6 mb-8">
            <PrimaryButton
              label={
                page === onboardingPage.length - 1 ? "Get Started" : "Next"
              }
              onPress={handleNext}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
