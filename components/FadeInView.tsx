import { useEffect, useRef } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

type FadeInViewProps = {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  direction?: "up" | "down" | "none";
  distance?: number;
  style?: object;
  triggerKey?: number | string;
  isLoading?: boolean;
};

export default function FadeInView({
  children,
  delay = 0,
  duration = 400,
  direction = "up",
  distance = 20,
  style,
  triggerKey,
  isLoading = false,
}: FadeInViewProps) {
  const initialY =
    direction === "up" ? distance : direction === "down" ? -distance : 0;

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(initialY);
  const wasLoading = useRef(isLoading);

  useEffect(() => {
    if (isLoading) {
      opacity.value = 0;
      translateY.value = initialY;
      wasLoading.current = true;
      return;
    }

    if (wasLoading.current) {
      wasLoading.current = false;
      opacity.value = 0;
      translateY.value = initialY;
    }

    opacity.value = withDelay(delay, withTiming(1, { duration }));
    translateY.value = withDelay(delay, withTiming(0, { duration }));
  }, [isLoading, triggerKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View key={triggerKey} style={animatedStyle}>{children}</Animated.View>
  );
}
