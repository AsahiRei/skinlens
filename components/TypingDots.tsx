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

const BOUNCE = -3;
const DURATION = 320;

export default function TypingDots({ label = "Thinking" }: { label?: string }) {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);
  const pulse = useSharedValue(1);

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
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 700 }),
        withTiming(1, { duration: 700 }),
      ),
      -1,
    );
  }, [dot1, dot2, dot3, pulse]);

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
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <View className="flex-row items-center gap-2 px-2 py-1.5">
      <Animated.Text style={pulseStyle} className="text-[13px] font-semibold text-green-700">
        {label}
      </Animated.Text>
      <View className="flex-row items-center gap-1">
        {styles.map((style, i) => (
          <Animated.View
            key={i}
            style={style}
            className="w-1.5 h-1.5 rounded-full bg-green-700"
          />
        ))}
      </View>
    </View>
  );
}
