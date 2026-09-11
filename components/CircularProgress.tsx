import React, { useEffect } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
  useDerivedValue,
} from "react-native-reanimated";

type CircularProgressProps = {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  strokeLinecap?: "round" | "butt";
  animated?: boolean;
  duration?: number;
  className?: string;
  children?: React.ReactNode;
};

export default function CircularProgress({
  progress,
  size = 140,
  strokeWidth = 12,
  color = "#22c55e",
  trackColor = "#e5e7eb",
  strokeLinecap = "round",
  animated = true,
  duration = 800,
  className = "",
  children,
}: CircularProgressProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progressValue = useSharedValue(0);

  useEffect(() => {
    if (animated) {
      progressValue.value = withTiming(clamped, {
        duration,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      progressValue.value = clamped;
    }
  }, [clamped, animated, duration]);

  const derivedOffset = useDerivedValue(() => {
    return circumference - (progressValue.value / 100) * circumference;
  });

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: derivedOffset.value,
  }));

  return (
    <View
      className={className}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeLinecap={strokeLinecap}
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
          animatedProps={animatedProps}
        />
      </Svg>

      <View
        style={{
          position: "absolute",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
