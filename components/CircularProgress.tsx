import React, { useEffect, useRef } from "react";
<<<<<<< HEAD
import { Animated, Easing, View } from "react-native";
=======
import { View, Animated, Easing } from "react-native";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type CircularProgressProps = {
  /** 0 - 100 */
  progress: number;
  /** Diameter of the ring in px */
  size?: number;
  /** Thickness of the ring stroke */
  strokeWidth?: number;
  /** Color of the filled progress arc */
  color?: string;
  /** Color of the track behind the progress arc */
  trackColor?: string;
  /** Rounded vs flat line caps */
  strokeLinecap?: "round" | "butt";
  /** Animate when progress changes */
  animated?: boolean;
  /** Animation duration in ms */
  duration?: number;
  /** Extra NativeWind classes for the outer wrapper */
  className?: string;
  /** Anything you want rendered in the center (score, label, icon, etc.) */
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

  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.timing(animatedValue, {
        toValue: clamped,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      animatedValue.setValue(clamped);
    }
  }, [clamped, animated, duration]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

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
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap={strokeLinecap}
          // Start from the top (12 o'clock) instead of 3 o'clock
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>

      {/* Center content, absolutely positioned over the SVG */}
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
