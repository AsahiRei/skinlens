import { useEffect } from "react";
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
};

export default function FadeInView({
  children,
  delay = 0,
  duration = 500,
  direction = "up",
  distance = 20,
  style,
  triggerKey,
}: FadeInViewProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(
    direction === "up" ? distance : direction === "down" ? -distance : 0,
  );

  useEffect(() => {
    opacity.value = 0;
    translateY.value =
      direction === "up" ? distance : direction === "down" ? -distance : 0;

    opacity.value = withDelay(delay, withTiming(1, { duration }));
    translateY.value = withDelay(delay, withTiming(0, { duration }));
  }, [triggerKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>{children}</Animated.View>
  );
}
