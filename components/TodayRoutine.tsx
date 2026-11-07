/**
 * Building blocks for the Home screen's "Today's Routine" card.
 *
 *  - PeriodTabs: segmented control; the thumb glides to the selected period.
 *  - PeriodPanel: cross-fades the panel content when the period changes.
 *  - RoutineStepNode: a numbered step that fills when checked.
 *  - RoutineCompleteBanner: confirmation once every step in a period is done.
 *
 * Motion rules for this card (one motion per event, nothing decorative):
 *  - Selecting a period → only the thumb moves; content fades, no re-stagger.
 *  - Checking a step   → circle fills + check fades in. Press scale is the
 *    only "physical" feedback; no bounce or overshoot on release.
 *  - Connectors change colour with the step, no choreographed line drawing.
 *  - Nothing animates on first render; the card's own entrance covers that.
 *  - Tactile feedback comes from haptics (lib/haptics.ts), not from bounce.
 *
 * Uses the timing language in components/motion.tsx and honours the OS
 * "Reduce motion" setting.
 */
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Pressable, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  LayoutAnimationConfig,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { Check } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import { Text } from "@/components/Text";
import { bubbleIn, fadeOut, PressableScale } from "@/components/motion";
import { haptics } from "@/lib/haptics";
import { cardShadow, theme } from "@/lib/theme";

/** Standard "emphasized decelerate" curve: fast start, soft landing, no overshoot. */
const EASE_OUT = Easing.bezier(0.2, 0, 0, 1);
const THUMB_TIMING = { duration: 240, easing: EASE_OUT } as const;
const STATE_TIMING = { duration: 160, easing: Easing.out(Easing.quad) } as const;

/** Check mark arriving: small scale-up + fade, 160 ms, no spring. */
const checkIn = ZoomIn.duration(160)
  .easing(EASE_OUT)
  .withInitialValues({ transform: [{ scale: 0.6 }] })
  .reduceMotion(ReduceMotion.System);
const quickOut = FadeOut.duration(100).reduceMotion(ReduceMotion.System);
const numberIn = FadeIn.duration(160).reduceMotion(ReduceMotion.System);
const panelIn = FadeIn.duration(180)
  .easing(Easing.out(Easing.quad))
  .reduceMotion(ReduceMotion.System);

/* ---------- Segmented control ---------- */

export type PeriodTab = {
  key: string;
  label: string;
  a11yLabel: string;
  icon: LucideIcon;
  done: number;
  total: number;
};

const TRACK_PAD = 4; // p-1
const TAB_GAP = 4; // gap-1

export function PeriodTabs({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: PeriodTab[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useSharedValue(0);
  const placed = useRef(false);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeKey),
  );
  const tabWidth =
    trackWidth > 0 ? (trackWidth - TRACK_PAD * 2 - TAB_GAP * (tabs.length - 1)) / tabs.length : 0;

  useEffect(() => {
    if (!tabWidth) return;
    const target = activeIndex * (tabWidth + TAB_GAP);
    // First placement (and resizes before that) snap; later changes glide.
    if (!placed.current || reduceMotion) {
      translateX.value = target;
      placed.current = true;
    } else {
      translateX.value = withTiming(target, THUMB_TIMING);
    }
  }, [activeIndex, tabWidth, reduceMotion, translateX]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
      className="flex-row p-1 gap-1"
      style={{ backgroundColor: theme.colors.primarySoft, borderRadius: 16 }}
    >
      {tabWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: TRACK_PAD,
              top: TRACK_PAD,
              bottom: TRACK_PAD,
              width: tabWidth,
              borderRadius: 12,
              backgroundColor: theme.colors.card,
              ...cardShadow,
            },
            thumbStyle,
          ]}
        />
      )}

      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const isComplete = tab.total > 0 && tab.done === tab.total;
        const Icon = tab.icon;
        const status = tab.total === 0 ? "—" : isComplete ? "Done" : `${tab.done}/${tab.total}`;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (isActive) return;
              haptics.selection();
              onChange(tab.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.a11yLabel}
            className="flex-1 items-center py-2"
            style={{ borderRadius: 12 }}
          >
            <View className="flex-row items-center gap-1">
              <Icon size={14} color={isActive ? theme.colors.primary : theme.colors.muted} />
              <Text
                className="text-[12px] font-bold"
                numberOfLines={1}
                style={{ color: isActive ? theme.colors.ink : theme.colors.muted }}
              >
                {tab.label}
              </Text>
            </View>
            <View className="flex-row items-center gap-0.5 mt-0.5">
              {isComplete ? <Check size={10} color={theme.colors.primary} strokeWidth={3} /> : null}
              <Text
                className="text-[10px] font-semibold"
                style={{
                  color: isComplete ? theme.colors.primary : theme.colors.faint,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {status}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Panel ---------- */

/**
 * Holds the content for one period. Changing `periodKey` cross-fades the content once; nothing
 * inside re-plays its entrance.
 */
export function PeriodPanel({
  periodKey,
  children,
}: {
  periodKey: string;
  children: React.ReactNode;
}) {
  return (
    <LayoutAnimationConfig skipEntering>
      <Animated.View key={periodKey} entering={panelIn} className="flex-col gap-4">
        {/* Remounting with a new period must not replay check-mark entrances. */}
        <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>
      </Animated.View>
    </LayoutAnimationConfig>
  );
}

/* ---------- Connector half-line ---------- */

/** Grey track; turns green with a short cross-fade when both neighbours are done. */
function ConnectorHalf({ side, filled }: { side: "left" | "right"; filled: boolean }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    const to = filled ? 1 : 0;
    progress.value = reduceMotion ? to : withTiming(to, STATE_TIMING);
  }, [filled, reduceMotion, progress]);

  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <View
      pointerEvents="none"
      className="absolute h-0.5"
      style={[
        { backgroundColor: theme.colors.cardBorder },
        side === "left" ? { left: 0, right: "50%" } : { left: "50%", right: 0 },
      ]}
    >
      <Animated.View
        className="absolute inset-0"
        style={[{ backgroundColor: theme.colors.primary }, fillStyle]}
      />
    </View>
  );
}

/* ---------- Step node ---------- */

export function RoutineStepNode({
  index,
  label,
  isDone,
  isPending,
  prevDone,
  nextDone,
  isFirst,
  isLast,
  onPress,
}: {
  index: number;
  label: string;
  isDone: boolean;
  isPending: boolean;
  prevDone: boolean;
  nextDone: boolean;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const done = useSharedValue(isDone ? 1 : 0);

  useEffect(() => {
    const to = isDone ? 1 : 0;
    done.value = reduceMotion ? to : withTiming(to, STATE_TIMING);
  }, [isDone, reduceMotion, done]);

  const circleStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      done.value,
      [0, 1],
      [theme.colors.card, theme.colors.primary],
    ),
    borderColor: interpolateColor(
      done.value,
      [0, 1],
      [theme.colors.cardBorder, theme.colors.primary],
    ),
  }));

  return (
    <PressableScale
      onPress={onPress}
      disabled={isPending}
      activeScale={0.96}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isDone, busy: isPending }}
      accessibilityLabel={`Step ${index + 1}, ${label}, ${isDone ? "completed" : "not completed"}`}
      className={`flex-1 flex-col items-center gap-1.5 ${isPending ? "opacity-50" : ""}`}
    >
      <View className="w-full items-center justify-center h-10">
        {!isFirst && <ConnectorHalf side="left" filled={isDone && prevDone} />}
        {!isLast && <ConnectorHalf side="right" filled={isDone && nextDone} />}
        <Animated.View
          className="h-10 w-10 rounded-full items-center justify-center"
          style={[{ borderWidth: 1.5 }, circleStyle]}
        >
          {isDone ? (
            <Animated.View key="check" entering={checkIn} exiting={quickOut}>
              <Check size={18} color="white" strokeWidth={3} />
            </Animated.View>
          ) : (
            <Animated.View key="num" entering={numberIn} exiting={quickOut}>
              <Text
                className="text-[14px] font-bold"
                style={{ color: theme.colors.primary, fontVariant: ["tabular-nums"] }}
              >
                {index + 1}
              </Text>
            </Animated.View>
          )}
        </Animated.View>
      </View>
      <Text
        className="text-[11px] text-center leading-[14px] px-0.5"
        style={{
          color: isDone ? theme.colors.muted : theme.colors.ink,
          fontWeight: isDone ? "400" : "600",
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

/* ---------- Completion banner ---------- */

export function RoutineCompleteBanner({ label }: { label: string }) {
  return (
    <Animated.View
      entering={bubbleIn}
      exiting={fadeOut}
      className="flex-row items-center gap-2 px-3 py-2.5"
      style={{ backgroundColor: theme.colors.primarySoft, borderRadius: 12 }}
      accessibilityLiveRegion="polite"
    >
      <View
        className="h-5 w-5 rounded-full items-center justify-center"
        style={{ backgroundColor: theme.colors.primary }}
      >
        <Check size={12} color="white" strokeWidth={3} />
      </View>
      <Text className="text-xs font-semibold flex-1" style={{ color: theme.colors.primaryDeep }}>
        {label} routine done for today.
      </Text>
    </Animated.View>
  );
}
