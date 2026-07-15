import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CircleProgressProps {
  /** Progress value from 0 to 100 */
  progress: number;
  /** Diameter of the circle. If omitted, it scales responsively with screen width */
  size?: number;
  /** Thickness of the progress stroke. If omitted, it scales with size */
  strokeWidth?: number;
  /** Color of the progress arc */
  color?: string;
  /** Color of the background track */
  backgroundColor?: string;
  /** Animation duration in ms */
  duration?: number;
  /** Show the percentage label in the center */
  showPercentage?: boolean;
  /** Custom label instead of percentage (e.g. "Loading") */
  label?: string;
  /** Font size for the center text. If omitted, scales with size */
  fontSize?: number;
  /** Round or flat stroke ends */
  strokeLinecap?: 'round' | 'butt' | 'square';
  /** NativeWind classes for the outer wrapper (e.g. margins, extra layout) */
  className?: string;
  /** NativeWind classes for the center label text */
  labelClassName?: string;
}

/**
 * Responsive animated circular progress indicator.
 *
 * Responsiveness:
 * - If `size` isn't passed, it's derived from the screen's shortest side
 *   (clamped between 100 and 220), and re-computes on rotation / resize.
 * - `strokeWidth` and `fontSize` scale proportionally with `size` unless
 *   explicitly overridden.
 *
 * NativeWind:
 * - Pass `className` for the outer wrapper (margins, layout, etc.) and
 *   `labelClassName` to restyle the center text (e.g. "text-white").
 * - `width`/`height`/`fontSize` stay as inline styles since they're computed
 *   at runtime and can't be expressed as static Tailwind classes.
 */
export default function CircleProgress({
  progress,
  size,
  strokeWidth,
  color = '#4F46E5',
  backgroundColor = '#E5E7EB',
  duration = 800,
  showPercentage = true,
  label,
  fontSize,
  strokeLinecap = 'round',
  className = '',
  labelClassName = '',
}: CircleProgressProps) {
  const { width, height } = useWindowDimensions();

  // Derive a responsive size from the shortest screen dimension if not provided
  const shortestSide = Math.min(width, height);
  const responsiveSize = Math.max(100, Math.min(220, shortestSide * 0.45));
  const resolvedSize = size ?? responsiveSize;

  const resolvedStrokeWidth = strokeWidth ?? Math.max(6, resolvedSize * 0.09);
  const resolvedFontSize = fontSize ?? resolvedSize * 0.18;

  const clampedProgress = Math.max(0, Math.min(100, progress));

  const radius = (resolvedSize - resolvedStrokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = React.useState(0);

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: clampedProgress,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [clampedProgress, duration]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      className={`items-center justify-center ${className}`}
      style={{ width: resolvedSize, height: resolvedSize }}
    >
      <Svg width={resolvedSize} height={resolvedSize}>
        {/* Background track */}
        <Circle
          cx={resolvedSize / 2}
          cy={resolvedSize / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={resolvedStrokeWidth}
          fill="transparent"
        />
        {/* Animated progress arc */}
        <AnimatedCircle
          cx={resolvedSize / 2}
          cy={resolvedSize / 2}
          r={radius}
          stroke={color}
          strokeWidth={resolvedStrokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap={strokeLinecap}
          // Rotate so progress starts at the top (12 o'clock)
          rotation={-90}
          origin={`${resolvedSize / 2}, ${resolvedSize / 2}`}
        />
      </Svg>

      {(showPercentage || label) && (
        <View className="absolute items-center justify-center">
          <Text
            className={`font-semibold text-gray-900 ${labelClassName}`}
            style={{ fontSize: resolvedFontSize }}
          >
            {label ?? `${displayValue}%`}
          </Text>
        </View>
      )}
    </View>
  );
}