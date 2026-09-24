import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";

type InlineProgressBarProps = {
  progress: number;
  width?: number | `${number}%`;
  height?: number;
  color?: string;
  trackColor?: string;
  borderRadius?: number;
  animated?: boolean;
  duration?: number;
  className?: string;
  children?: React.ReactNode;
};

export default function InlineProgress({
  progress,
  width = "100%",
  height = 10,
  color = "#22c55e",
  trackColor = "#e5e7eb",
  borderRadius,
  animated = true,
  duration = 800,
  className = "",
  children,
}: InlineProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const radius = borderRadius ?? height / 2;

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
  }, [clamped, animated, duration, progressValue]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value}%`,
  }));

  return (
    <View
      className={className}
      style={{
        flexDirection: "row",
        alignItems: "center",
        width,
      }}
    >
      <View
        style={{
          flex: 1,
          height,
          borderRadius: radius,
          backgroundColor: trackColor,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            {
              height: "100%",
              borderRadius: radius,
              backgroundColor: color,
            },
            fillStyle,
          ]}
        />
      </View>

      {children && <View style={{ marginLeft: 8 }}>{children}</View>}
    </View>
  );
}
