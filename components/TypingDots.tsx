import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const DOT_COUNT = 3;
const BOUNCE = -4;
const DURATION = 300;

export default function TypingDots() {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const dots = [dot1, dot2, dot3];
    dots.forEach((d, i) => {
      d.value = withDelay(
        i * 120,
        withRepeat(
          withSequence(
            withTiming(BOUNCE, { duration: DURATION }),
            withTiming(0, { duration: DURATION }),
          ),
          -1,
        ),
      );
    });
  }, []);

  const style1 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot1.value }],
  }));
  const style2 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot2.value }],
  }));
  const style3 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot3.value }],
  }));

  const styles = [style1, style2, style3];

  return (
    <View className="flex-row items-center gap-1 px-1 py-1">
      {styles.map((style, i) => (
        <Animated.View
          key={i}
          style={style}
          className="w-2 h-2 rounded-full bg-gray-400"
        />
      ))}
    </View>
  );
}
