/**
 * Shared motion primitives. One timing language for the whole app:
 *
 *  - Press feedback: a quick spring scale-down (0.97) while a finger is on a
 *    control, so every tappable surface feels physical.
 *  - Entrances: short (≤ 400 ms) ease-out fades with a small rise.
 *  - Dialogs: backdrop fades, card springs up from 0.94.
 *
 * Everything here honours the OS "Reduce motion" setting via Reanimated's
 * ReduceMotion.System (layout animations) or useReducedMotion (hand-rolled).
 */
import type React from "react";
import { forwardRef, useEffect } from "react";
import type { PressableProps, StyleProp, View, ViewStyle } from "react-native";
import { Pressable } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolateColor,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Spring used for press feedback — snappy, no visible overshoot. */
export const PRESS_SPRING = { damping: 20, stiffness: 380, mass: 0.6 } as const;

/* ---------- Ready-made layout animations ---------- */

/** List row / card entering: fade + 12px rise, staggered by `index`. */
export function enterUp(index = 0, step = 45) {
  return FadeInDown.duration(320)
    .delay(Math.min(index, 8) * step)
    .easing(Easing.out(Easing.cubic))
    .withInitialValues({ transform: [{ translateY: 12 }] })
    .reduceMotion(ReduceMotion.System);
}

/** Plain fade-in, for content swapping in place (loaded → content). */
export const fadeIn = FadeIn.duration(260).reduceMotion(ReduceMotion.System);
export const fadeOut = FadeOut.duration(180).reduceMotion(ReduceMotion.System);

/** Chat bubble / toast arriving: quick fade + small rise. */
export const bubbleIn = FadeInDown.duration(240)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ transform: [{ translateY: 10 }] })
  .reduceMotion(ReduceMotion.System);

/** Pop-in for badges, check marks and result highlights. */
export const popIn = ZoomIn.springify()
  .damping(16)
  .stiffness(220)
  .reduceMotion(ReduceMotion.System);

/** Neighbours glide into place when a list item is added or removed. */
export const listLayout = LinearTransition.duration(260)
  .easing(Easing.out(Easing.cubic))
  .reduceMotion(ReduceMotion.System);

/* ---------- PressableScale ---------- */

type PressableScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** Scale while pressed. 0.97 for buttons, 0.985 for large cards. */
  activeScale?: number;
  children?: React.ReactNode;
};

/** Drop-in Pressable that springs down slightly while held. */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { activeScale = 0.97, style, onPressIn, onPressOut, disabled, children, ...rest },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={(e) => {
        if (!reduceMotion && !disabled) {
          scale.set(withSpring(activeScale, PRESS_SPRING));
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, PRESS_SPRING));
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});

/* ---------- Dialog card entrance ---------- */

/** Wraps a dialog card so it springs in from 0.94 + fades when `visible` flips on. */
export function DialogCard({
  visible,
  children,
  style,
}: {
  visible: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  // Restart each time the dialog opens; snap back while hidden.
  useEffect(() => {
    if (visible) {
      progress.value = 0;
      progress.value = reduceMotion ? 1 : withSpring(1, { damping: 18, stiffness: 240, mass: 0.7 });
    } else {
      progress.value = 0;
    }
  }, [visible, reduceMotion, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.4),
    transform: [{ scale: 0.94 + progress.value * 0.06 }, { translateY: (1 - progress.value) * 10 }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/* ---------- Tab focus ---------- */

/**
 * Animated style for a tab's active pill: the highlight fades in and the
 * content gives a small spring "lift" when the tab becomes active.
 */
export function useTabFocusStyle(focused: boolean, activeBg: string) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? focused
        ? 1
        : 0
      : withSpring(focused ? 1 : 0, { damping: 16, stiffness: 260, mass: 0.6 });
  }, [focused, reduceMotion, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ["rgba(255, 255, 255, 0)", activeBg]),
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -1.5 * progress.value }, { scale: 1 + 0.08 * progress.value }],
  }));

  return { pillStyle, iconStyle };
}

/* ---------- Progress bar fill ---------- */

/**
 * Horizontal bar fill that grows from 0 → `percent` (0–100) on mount and glides to new values.
 */
export function AnimatedBarFill({
  percent,
  color,
  delay = 0,
  className = "h-full rounded-full",
}: {
  percent: number;
  color: string;
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, percent));
  const width = useSharedValue(reduceMotion ? clamped : 0);

  useEffect(() => {
    width.value = reduceMotion
      ? clamped
      : withDelay(delay, withTiming(clamped, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [clamped, delay, reduceMotion, width]);

  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return <Animated.View className={className} style={[{ backgroundColor: color }, style]} />;
}
