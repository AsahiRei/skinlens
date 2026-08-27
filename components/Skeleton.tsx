<<<<<<< HEAD
import { useEffect, useRef } from "react";
import { Animated } from "react-native";
=======
import { Animated } from "react-native";
import { useEffect, useRef } from "react";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38

export default function Skeleton({ className }: { className: string }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={`bg-gray-300 rounded-md ${className}`}
      style={{ opacity }}
    />
  );
}
