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
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
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

/** A registered tour target: the measure callback plus an optional way to
 * scroll the target back into view (screens that host targets inside a
 * scrollable pass `useCoachScroller`'s scrollIntoView). */
type CoachTargetEntry = {
  measure: () => void;
  scrollIntoView?: (rect: CoachRect) => void;
};

type CoachContextValue = {
  /** Run the full tour (first-run flow calls this before opening the tabs). */
  startTutorial: () => void;
  registerTarget: (id: string, entry: CoachTargetEntry) => void;
  unregisterTarget: (id: string) => void;
  reportTarget: (id: string, rect: CoachRect) => void;
};

/** Group segments (e.g. "(tabs)") are not part of a route's identity, and
 * usePathname may or may not keep them — strip both sides before comparing,
 * otherwise the tour re-pushes routes it is already on (polluting the back
 * stack) or fails to notice it already arrived. */
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

/** Gap between the highlighted element and the dimmed layer. */
const HOLE_PADDING = 8;
const SPOTLIGHT_ANIM = { duration: 260 };

const styles = StyleSheet.create({
  /* Dim layer — four panes around the spotlight so the highlighted hole
   * stays fully interactive-looking while everything else is covered. */
  pane: { position: "absolute", backgroundColor: "rgba(16, 36, 26, 0.62)" },
  ring: {
    position: "absolute",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#4ADE80",
  },
  card: {
    position: "absolute",
    left: 24,
    right: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 18,
    ...cardShadow,
  },
});

/**
 * Interactive coach-mark tutorial: dims the screen, puts a spotlight on the
 * real element being explained and walks the user through every tab
 * (Home → Scan → Routine → Derma → Profile), navigating between them as the
 * tour advances. Screens mark their elements with <CoachTarget id="..."> and
 * the first-run flow starts the tour via startTutorial().
 *
 * Mounted once in the root layout so the overlay covers the whole app,
 * including the tab bar.
 */
export function TutorialCoachProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { width: winW, height: winH } = useWindowDimensions();
  // id -> target entry, fed by the CoachTarget wrappers.
  const targets = useRef(new Map<string, CoachTargetEntry>());
  const [steps, setSteps] = useState<CoachStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rectReport, setRectReport] = useState<{
    step: number;
    rect: CoachRect;
  } | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  // React state can't stop a double-tap (updates are async) — the ref makes
  // start/end idempotent, same pattern as the setup loading screen.
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
  // Only the current step's reports land — a rect measured for another step
  // (or an earlier visit) must not move the spotlight. The derived `rect`
  // below drops stale reports without a state-reset effect.
  const scrolledStepRef = useRef(-1);
  const reportTarget = useCallback((id: string, r: CoachRect) => {
    const stepIndex = indexRef.current;
    const step = stepsRef.current?.[stepIndex];
    if (!step || step.target !== id) return;
    // The driver re-measures on a tick to catch layout changes; ignore the
    // no-op reports so the spotlight only animates when it actually moved.
    setRectReport((prev) =>
      prev && prev.step === stepIndex && sameRect(prev.rect, r)
        ? prev
        : { step: stepIndex, rect: r },
    );
    // Tab screens keep their scroll offset between visits and the tour
    // blocks all input, so a target can sit above/below the fold when the
    // spotlight lands (e.g. replaying from the bottom of Profile puts
    // profile.card off-screen). Ask the screen to scroll it into view —
    // at most once per step, so we never fight our own scroll animation.
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
      // Done (or skipped) — never auto-run the tour again on boot.
      void requireUser()
        .then((user) => clearTutorialPending(user.id))
        .catch(() => {});
      // Finish lands back on Home; Skip leaves the user where they are.
      if (finished && !sameRoute(pathname, "/(tabs)")) router.push("/(tabs)");
    },
    [pathname, router],
  );

  // Step driver: navigate to the step's screen (if it has one), then keep
  // measuring the target — screens mount and lay out asynchronously, tab
  // transitions report mid-flight coordinates, and scroll offsets can shift
  // between visits.
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
      // Measuring before the destination has landed returns the outgoing
      // screen's coordinates (or zeros for a detached tab) — that's what
      // used to park the spotlight in the wrong place when the tour was
      // replayed from another tab. The fallback keeps the old behaviour
      // in case the navigation somehow never lands.
      const arrived =
        !step.href ||
        attempt > 20 ||
        sameRoute(pathnameRef.current, step.href);
      if (arrived) targets.current.get(step.target)?.measure();
      // Keep re-measuring for a settle window: the target moves after its
      // first report (tab transition, staggered FadeItem reveal, late data
      // load) and the last report wins.
      if (attempt < 40) timer = setTimeout(tick, 160);
    };
    timer = setTimeout(tick, needsNav ? 120 : 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [steps, index, pathname, router]);

  /* Spotlight rect → animated shared values. Before the first measurement
   * the rect covers the whole screen (solid dim), then it snaps onto the
   * target and glides between steps. */
  const rect = rectReport?.step === index ? rectReport.rect : null;
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
  /* Tooltip sits below the spotlight when there is room, otherwise above. */
  const cardStyle = useAnimatedStyle(() => {
    const gap = 16;
    const spaceBelow = winH - (rsy.value + rsh.value);
    const top =
      spaceBelow > cardHeight + gap + 24
        ? rsy.value + rsh.value + gap
        : Math.max(rsy.value - cardHeight - gap, 16);
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
        {/* Full-screen press catcher: taps never reach the UI mid-tour. */}
        <View style={{ flex: 1 }}>
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
              {/* key: remeasure the card when the copy changes length */}
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
        </View>
      </Modal>
    </TutorialContext.Provider>
  );
}

/**
 * Marks a UI element as a tour target. Measures itself into window
 * coordinates on layout and whenever the tour asks (the provider calls the
 * registered measure on each step). `collapsable={false}` keeps Android
 * from eliding the native view, which would break measureInWindow.
 */
export function CoachTarget({
  id,
  children,
  scrollIntoView,
  ...rest
}: ViewProps & {
  id: string;
  /** From useCoachScroller — lets the coach scroll this target back into
   * view when it measures off-screen. Pass it for targets that live inside
   * a scrollable. */
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
