import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

export default function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const makeBounce = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: -4,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(300 - delay),
        ]),
      );
    const anim1 = makeBounce(dot1, 0);
    const anim2 = makeBounce(dot2, 120);
    const anim3 = makeBounce(dot3, 240);
    anim1.start();
    anim2.start();
    anim3.start();
    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);
  return (
    <View className="flex-row items-center gap-1 px-1 py-1">
      {[dot1, dot2, dot3].map((value, i) => (
        <Animated.View
          key={i}
          style={{ transform: [{ translateY: value }] }}
          className="w-2 h-2 rounded-full bg-gray-400"
        />
      ))}
    </View>
  );
}
