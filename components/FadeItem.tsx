import type React from "react";
import { memo, useEffect } from "react";
import type { ViewProps } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { useRevealTrigger } from "@/hooks/useRevealTrigger";

type FadeItemProps = ViewProps & {
  children?: React.ReactNode;
  /** Position in the stagger: the item waits `index * step` ms before fading in. */
  index?: number;
  /** Delay in ms between two consecutive indices. */
  step?: number;
  /** Fade duration in ms. */
  duration?: number;
  /** Distance in px the item rises while fading in. */
  distance?: number;
};

/**
 * Fades + rises in after `index * step` ms, and replays every time the screen
 * regains focus or its tab button is pressed again — so entrance animations
 * are not limited to the first mount.
 *
 * Accepts the same props as a View (className, style, ...), so it can stand in
 * for the block it wraps:
 *
 *   <FadeItem index={0} className="mt-5">...</FadeItem>
 */
export const FadeItem = memo(function FadeItem({
  index = 0,
  step = 50,
  duration = 400,
  distance = 14,
  children,
  style,
  ...rest
}: FadeItemProps) {
  const trigger = useRevealTrigger();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      index * step,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [trigger, index, step, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]} {...rest}>
      {children}
    </Animated.View>
  );
});
