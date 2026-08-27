<<<<<<< HEAD
import { useEffect } from "react";
import { View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
=======
import { View } from "react-native";
import { useEffect } from "react";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
} from "react-native-reanimated";

const RING_SIZE = 140;
const CORE_SIZE = 72;
const RING_DURATION = 2200;

export default function PulsatingIcon() {
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);
  useEffect(() => {
    const loop = () =>
      withRepeat(
        withTiming(1, {
          duration: RING_DURATION,
          easing: Easing.out(Easing.ease),
        }),
        -1,
        false,
      );
    ring1.value = loop();
    ring2.value = withDelay(RING_DURATION / 3, loop());
    ring3.value = withDelay((RING_DURATION / 3) * 2, loop());
  }, []);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + ring1.value * 0.85 }],
    opacity: (1 - ring1.value) * 0.45,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + ring2.value * 0.85 }],
    opacity: (1 - ring2.value) * 0.45,
  }));
  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + ring3.value * 0.85 }],
    opacity: (1 - ring3.value) * 0.45,
  }));

  return (
    <View
      className="items-center justify-center"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      {[ring1Style, ring2Style, ring3Style].map((style, i) => (
        <Animated.View
          key={i}
          style={[
            style,
            {
              position: "absolute",
              width: RING_SIZE,
              height: RING_SIZE,
              borderRadius: RING_SIZE / 2,
            },
          ]}
          className="bg-green-700"
        />
      ))}
      <View
        style={{
          width: CORE_SIZE,
          height: CORE_SIZE,
          borderRadius: CORE_SIZE / 2,
        }}
        className="bg-green-800 items-center justify-center"
      >
        <Ionicons name="scan-outline" size={28} color="white" />
      </View>
    </View>
  );
}
