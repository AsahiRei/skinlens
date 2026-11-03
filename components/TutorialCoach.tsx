import type React from "react";
import type { ViewProps } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { usePathname, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { PrimaryButton } from "@/components/ui";
import { requireUser } from "@/lib/db/auth";
import { cardShadow, theme } from "@/lib/theme";
import { clearTutorialPending } from "@/lib/tutorial";
import { TUTORIAL_STEPS, type CoachStep } from "@/lib/tutorial-steps";

export type CoachRect = { x: number; y: number; width: number; height: number };

/** Resolved position/rotation of the mascot for the current step. */
type MascotPose = {
  left: number;
  top: number;
  flip: boolean;
  rotation: number;
  /** Which art to show: the up-pointing or the down-pointing mascot. */
  down: boolean;
};

type CoachTargetEntry = {
  measure: () => void;
  scrollIntoView?: (rect: CoachRect) => void;
};

type CoachContextValue = {
  startTutorial: () => void;
  registerTarget: (id: string, entry: CoachTargetEntry) => void;
  unregisterTarget: (id: string) => void;
  reportTarget: (id: string, rect: CoachRect) => void;
};

function normalizePath(path: string): string {
  const withoutQuery = path.split("?")[0] ?? "";
  return (
    "/" +
    withoutQuery
      .split("/")
      .filter((segment) => segment.length > 0 && !segment.startsWith("("))
      .join("/")
  );
}

function sameRoute(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

function sameRect(a: CoachRect, b: CoachRect): boolean {
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

const TutorialContext = createContext<CoachContextValue | null>(null);

export function useTutorial(): CoachContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used inside TutorialCoachProvider");
  return ctx;
}

const HOLE_PADDING = 8;
const SPOTLIGHT_ANIM = { duration: 260 };
const CARD_GAP = 16;
const CARD_EDGE = 24;
const CARD_PADDING = 18;

/** The mascot art is a tall portrait: 572 × 1024. */
const MASCOT_HEIGHT = 160;
const MASCOT_WIDTH = Math.round((MASCOT_HEIGHT * 572) / 1024);
/** Reserved right-hand column so the mascot never lands on the card copy. */
const MASCOT_GUTTER = CARD_PADDING + MASCOT_WIDTH + 6;
/**
 * How far the mascot reaches past the card edge toward the spotlight. The
 * upward pose can reach further because its top third is empty air, while the
 * downward pose stops sooner so the shoes never land on the highlighted UI.
 */
const MASCOT_POKE_UP = 36;
const MASCOT_POKE_DOWN = 16;
/** Furthest the mascot may lean, so it never tips onto its side. */
const MAX_ROTATION = 55;
/** Direction each pose's finger points, in degrees (0 = right, 90 = down). */
const POSE_UP_NATIVE = -105;
const POSE_DOWN_NATIVE = 143;
const POSE_UP = require("@/assets/images/others/4.png");
const POSE_DOWN = require("@/assets/images/others/5.png");

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Wraps an angle into (-180, 180]. */
function normalizeDeg(deg: number): number {
  const wrapped = deg % 360;
  if (wrapped > 180) return wrapped - 360;
  if (wrapped <= -180) return wrapped + 360;
  return wrapped;
}

/**
 * Where the card sits vertically for a given spotlight rect. Keep this in
 * sync with the `cardStyle` worklet below — it repeats the same maths because
 * a worklet can't call a function that lives on the JS runtime.
 */
function cardTopFor(
  rect: CoachRect,
  cardHeight: number,
  winH: number,
): number {
  const spaceBelow = winH - (rect.y + rect.height);
  return spaceBelow > cardHeight + CARD_GAP + 24
    ? rect.y + rect.height + CARD_GAP
    : Math.max(rect.y - cardHeight - CARD_GAP, 16);
}

const styles = StyleSheet.create({
  pane: { position: "absolute", backgroundColor: "rgba(16, 36, 26, 0.62)" },
  ring: {
    position: "absolute",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#4ADE80",
  },
  card: {
    position: "absolute",
    left: CARD_EDGE,
    right: CARD_EDGE,
    backgroundColor: "#FFFFFF",
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    paddingTop: CARD_PADDING,
    paddingBottom: CARD_PADDING,
    paddingLeft: CARD_PADDING,
    // The mascot stands in this column on every step, so the copy never
    // reflows underneath it.
    paddingRight: MASCOT_GUTTER,
    ...cardShadow,
  },
  mascot: {
    position: "absolute",
    left: 0,
    top: 0,
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
  },
  mascotArt: {
    position: "absolute",
    left: 0,
    top: 0,
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
  },
});

export function TutorialCoachProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { width: winW, height: winH } = useWindowDimensions();
  const targets = useRef(new Map<string, CoachTargetEntry>());
  const [steps, setSteps] = useState<CoachStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rectReport, setRectReport] = useState<{
    step: number;
    rect: CoachRect;
  } | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const activeRef = useRef(false);
  const stepsRef = useRef<CoachStep[] | null>(null);
  const indexRef = useRef(0);
  const pathnameRef = useRef(pathname);
  const winHRef = useRef(winH);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    winHRef.current = winH;
  }, [winH]);

  const registerTarget = useCallback((id: string, entry: CoachTargetEntry) => {
    targets.current.set(id, entry);
  }, []);
  const unregisterTarget = useCallback((id: string) => {
    targets.current.delete(id);
  }, []);
  const scrolledStepRef = useRef(-1);
  const reportTarget = useCallback((id: string, r: CoachRect) => {
    const stepIndex = indexRef.current;
    const step = stepsRef.current?.[stepIndex];
    if (!step || step.target !== id) return;
    setRectReport((prev) =>
      prev && prev.step === stepIndex && sameRect(prev.rect, r)
        ? prev
        : { step: stepIndex, rect: r },
    );
    const entry = targets.current.get(id);
    if (!entry?.scrollIntoView || scrolledStepRef.current === stepIndex) return;
    const margin = 12;
    if (r.y >= margin && r.y + r.height <= winHRef.current - margin) return;
    scrolledStepRef.current = stepIndex;
    entry.scrollIntoView(r);
  }, []);

  const startTutorial = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    scrolledStepRef.current = -1;
    setIndex(0);
    setRectReport(null);
    setSteps(TUTORIAL_STEPS);
  }, []);

  const endTutorial = useCallback(
    (finished: boolean) => {
      if (!activeRef.current) return;
      activeRef.current = false;
      scrolledStepRef.current = -1;
      setSteps(null);
      setRectReport(null);
      void requireUser()
        .then((user) => clearTutorialPending(user.id))
        .catch(() => {});
      if (finished && !sameRoute(pathname, "/(tabs)")) router.push("/(tabs)");
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!steps) return;
    const step = steps[index];
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const needsNav = !!step.href && !sameRoute(pathname, step.href);
    if (needsNav) router.push(step.href as never);

    const tick = () => {
      if (cancelled) return;
      attempt += 1;
      const arrived =
        !step.href ||
        attempt > 20 ||
        sameRoute(pathnameRef.current, step.href);
      if (arrived) targets.current.get(step.target)?.measure();
      if (attempt < 40) timer = setTimeout(tick, 160);
    };
    timer = setTimeout(tick, needsNav ? 120 : 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [steps, index, pathname, router]);

  const rect = rectReport?.step === index ? rectReport.rect : null;

  /**
   * Where the mascot stands and which way it leans. It lives in the card's
   * right-hand gutter and reaches past the card edge toward the spotlight,
   * so it can never land on the highlighted element itself.
   */
  const mascot = useMemo<MascotPose | null>(() => {
    if (!rect) return null;
    const cardTop = cardTopFor(rect, cardHeight, winH);
    const targetBelow = rect.y + rect.height / 2 > cardTop + cardHeight / 2;
    const poke = targetBelow ? MASCOT_POKE_DOWN : MASCOT_POKE_UP;
    // Mirror the card's inner padding on the right, so the mascot sits in the
    // reserved gutter with a 6pt gap to the copy (see MASCOT_GUTTER).
    const left = winW - CARD_EDGE - 1 - CARD_PADDING - MASCOT_WIDTH;
    const top = targetBelow
      ? cardTop + cardHeight + poke - MASCOT_HEIGHT
      : cardTop - poke;
    const aim = Math.atan2(
      rect.y + rect.height / 2 - (top + MASCOT_HEIGHT / 2),
      rect.x + rect.width / 2 - (left + MASCOT_WIDTH / 2),
    ) * (180 / Math.PI);
    const native = targetBelow ? POSE_DOWN_NATIVE : POSE_UP_NATIVE;
    // Mirroring the art swaps its pointing direction across the vertical
    // axis, so try both and keep whichever needs the smaller lean.
    const lean = normalizeDeg(aim - native);
    const leanFlipped = normalizeDeg(aim - (180 - native));
    const flip = Math.abs(leanFlipped) < Math.abs(lean);
    const pose: MascotPose = {
      left,
      top,
      flip,
      rotation: clamp(flip ? leanFlipped : lean, -MAX_ROTATION, MAX_ROTATION),
      down: targetBelow,
    };
    return pose;
  }, [rect, cardHeight, winH, winW]);

  /**
   * The mascot is rendered straight from shared values so it can stay on
   * screen during the beat where the spotlight rect is cleared between steps.
   * `mpose` picks the art (0 = pointing up, 1 = pointing down) and `mopacity`
   * fades it in on the first step of a run.
   */
  const mx = useSharedValue(0);
  const my = useSharedValue(0);
  const mrot = useSharedValue(0);
  const mflip = useSharedValue(1);
  const mpose = useSharedValue(0);
  const mopacity = useSharedValue(0);
  const hadMascotRef = useRef(false);
  useEffect(() => {
    if (!steps) {
      // A fresh run should start from the first pose, not glide in from
      // wherever the previous one finished.
      hadMascotRef.current = false;
      mopacity.value = 0;
      return;
    }
    if (!mascot) return;
    // Snap on the first appearance, glide between steps afterwards.
    const anim = {
      duration: hadMascotRef.current ? SPOTLIGHT_ANIM.duration : 1,
    };
    hadMascotRef.current = true;
    mx.value = withTiming(mascot.left, anim);
    my.value = withTiming(mascot.top, anim);
    mrot.value = withTiming(mascot.rotation, anim);
    mflip.value = withTiming(mascot.flip ? -1 : 1, anim);
    // Swapping the art instantly keeps the two poses from ghosting together.
    mpose.value = withTiming(mascot.down ? 1 : 0, { duration: 1 });
    mopacity.value = withTiming(1, { duration: 200 });
  }, [mascot, steps, mx, my, mrot, mflip, mpose, mopacity]);
  const mascotStyle = useAnimatedStyle(() => ({
    left: mx.value,
    top: my.value,
    opacity: mopacity.value,
    transform: [{ rotate: `${mrot.value}deg` }, { scaleX: mflip.value }],
  }));
  const poseUpStyle = useAnimatedStyle(() => ({
    opacity: mopacity.value * (1 - mpose.value),
  }));
  const poseDownStyle = useAnimatedStyle(() => ({
    opacity: mopacity.value * mpose.value,
  }));

  const rsx = useSharedValue(0);
  const rsy = useSharedValue(0);
  const rsw = useSharedValue(0);
  const rsh = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  const positionedRef = useRef(false);
  useEffect(() => {
    if (!rect) {
      rsx.value = 0;
      rsy.value = 0;
      rsw.value = winW;
      rsh.value = winH;
      ringOpacity.value = 0;
      positionedRef.current = false;
      return;
    }
    if (!positionedRef.current) {
      rsx.value = rect.x;
      rsy.value = rect.y;
      rsw.value = rect.width;
      rsh.value = rect.height;
      ringOpacity.value = 1;
      positionedRef.current = true;
      return;
    }
    rsx.value = withTiming(rect.x, SPOTLIGHT_ANIM);
    rsy.value = withTiming(rect.y, SPOTLIGHT_ANIM);
    rsw.value = withTiming(rect.width, SPOTLIGHT_ANIM);
    rsh.value = withTiming(rect.height, SPOTLIGHT_ANIM);
  }, [rect, winW, winH, rsx, rsy, rsw, rsh, ringOpacity]);

  const topPane = useAnimatedStyle(() => ({
    top: 0,
    left: 0,
    width: winW,
    height: Math.max(rsy.value - HOLE_PADDING, 0),
  }));
  const bottomPane = useAnimatedStyle(() => ({
    top: rsy.value + rsh.value + HOLE_PADDING,
    left: 0,
    width: winW,
    height: Math.max(winH - rsy.value - rsh.value - HOLE_PADDING, 0),
  }));
  const leftPane = useAnimatedStyle(() => ({
    top: rsy.value - HOLE_PADDING,
    left: 0,
    width: Math.max(rsx.value - HOLE_PADDING, 0),
    height: rsh.value + HOLE_PADDING * 2,
  }));
  const rightPane = useAnimatedStyle(() => ({
    top: rsy.value - HOLE_PADDING,
    left: rsx.value + rsw.value + HOLE_PADDING,
    width: Math.max(winW - rsx.value - rsw.value - HOLE_PADDING, 0),
    height: rsh.value + HOLE_PADDING * 2,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    top: rsy.value - HOLE_PADDING,
    left: rsx.value - HOLE_PADDING,
    width: rsw.value + HOLE_PADDING * 2,
    height: rsh.value + HOLE_PADDING * 2,
    opacity: ringOpacity.value,
  }));
  const cardStyle = useAnimatedStyle(() => {
    // Inlined rather than calling cardTopFor(): worklets can't call functions
    // that live on the JS runtime.
    const spaceBelow = winH - (rsy.value + rsh.value);
    const top =
      spaceBelow > cardHeight + CARD_GAP + 24
        ? rsy.value + rsh.value + CARD_GAP
        : Math.max(rsy.value - cardHeight - CARD_GAP, 16);
    return { top };
  }, [cardHeight, winH]);

  const goNext = () => {
    const current = stepsRef.current;
    if (!current) return;
    if (indexRef.current + 1 < current.length) setIndex(indexRef.current + 1);
    else endTutorial(true);
  };

  const step = steps?.[index];
  const isLast = index === (steps?.length ?? 0) - 1;

  const value = useMemo<CoachContextValue>(
    () => ({ registerTarget, unregisterTarget, reportTarget, startTutorial }),
    [registerTarget, unregisterTarget, reportTarget, startTutorial],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <Modal
        visible={steps !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => endTutorial(false)}
      >
        <View style={{ flex: 1 }} pointerEvents={step?.interactive ? "box-none" : "auto"}>
          <Animated.View pointerEvents="none" style={[styles.pane, topPane]} />
          <Animated.View pointerEvents="none" style={[styles.pane, bottomPane]} />
          <Animated.View pointerEvents="none" style={[styles.pane, leftPane]} />
          <Animated.View pointerEvents="none" style={[styles.pane, rightPane]} />
          <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
          {step ? (
            <Animated.View
              style={[styles.card, cardStyle]}
              onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
            >
              <View key={index}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "bold",
                    color: theme.colors.primary,
                    letterSpacing: 1,
                  }}
                >
                  STEP {index + 1} OF {steps?.length ?? 0}
                </Text>
                <Text
                  className="font-bold text-[18px] mt-1"
                  style={{ color: theme.colors.ink }}
                >
                  {step.title}
                </Text>
                <Text
                  className="text-[13px] mt-1.5 leading-5"
                  style={{ color: theme.colors.muted }}
                >
                  {step.body}
                </Text>
                <View className="flex-row items-center gap-3 mt-4">
                  <Pressable
                    onPress={() => endTutorial(false)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Skip tutorial"
                    className="active:opacity-60"
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: theme.colors.muted }}
                    >
                      Skip
                    </Text>
                  </Pressable>
                  <View className="flex-1">
                    <PrimaryButton
                      label={isLast ? "Finish" : "Next"}
                      onPress={goNext}
                    />
                  </View>
                </View>
              </View>
            </Animated.View>
          ) : null}
          {step ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.mascot, mascotStyle]}
            >
              <Animated.Image
                source={POSE_UP}
                style={[styles.mascotArt, poseUpStyle]}
                resizeMode="contain"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Animated.Image
                source={POSE_DOWN}
                style={[styles.mascotArt, poseDownStyle]}
                resizeMode="contain"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </TutorialContext.Provider>
  );
}

export function CoachTarget({
  id,
  children,
  scrollIntoView,
  ...rest
}: ViewProps & {
  id: string;
  scrollIntoView?: (rect: CoachRect) => void;
}) {
  const { registerTarget, unregisterTarget, reportTarget } = useTutorial();
  const ref = useRef<View>(null);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) reportTarget(id, { x, y, width, height });
    });
  }, [id, reportTarget]);
  useEffect(() => {
    registerTarget(id, { measure, scrollIntoView });
    return () => unregisterTarget(id);
  }, [id, measure, scrollIntoView, registerTarget, unregisterTarget]);
  return (
    <View ref={ref} collapsable={false} onLayout={measure} {...rest}>
      {children}
    </View>
  );
}
