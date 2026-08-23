import React, { useEffect, useRef } from "react";
import { View, Animated, Easing } from "react-native";

type InlineProgressBarProps = {
  /** 0 - 100 */
  progress: number;
  /** Width of the bar. Number (px) or percentage string, e.g. "100%" */
  width?: number | `${number}%`;
  /** Thickness (height) of the bar in px */
  height?: number;
  /** Color of the filled progress */
  color?: string;
  /** Color of the track behind the progress */
  trackColor?: string;
  /** Border radius of the bar. Defaults to fully rounded (height / 2) */
  borderRadius?: number;
  /** Animate when progress changes */
  animated?: boolean;
  /** Animation duration in ms */
  duration?: number;
  /** Extra NativeWind classes for the outer wrapper */
  className?: string;
  /** Optional content rendered to the right of the bar (label, %, icon, etc.) */
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

  const fillWidth = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View
      className={className}
      style={{
        flexDirection: "row",
        alignItems: "center",
        width,
      }}
    >
      {/* Track */}
      <View
        style={{
          flex: 1,
          height,
          borderRadius: radius,
          backgroundColor: trackColor,
          overflow: "hidden",
        }}
      >
        {/* Fill */}
        <Animated.View
          style={{
            height: "100%",
            width: fillWidth,
            borderRadius: radius,
            backgroundColor: color,
          }}
        />
      </View>

      {/* Optional trailing content (e.g. percentage label) */}
      {children && <View style={{ marginLeft: 8 }}>{children}</View>}
    </View>
  );
}
