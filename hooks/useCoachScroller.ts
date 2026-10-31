import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import {
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from "react-native";

import type { CoachRect } from "@/components/TutorialCoach";

/**
 * Pairs a scrollable with the tutorial coach so it can scroll a target back
 * into view. The tour blocks all input (the user cannot scroll themselves)
 * and tab screens keep their scroll offset between visits, so a target that
 * was on screen when the tour started can be above/below the fold when the
 * spotlight lands — this tracks the live offset and turns the coach's
 * "make this rect visible" request into a scrollTo.
 *
 *   const scrollRef = useRef<ScrollView>(null);
 *   const { onScroll, scrollIntoView } = useCoachScroller(scrollRef);
 *   ...
 *   <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={32}>
 *     <CoachTarget id="x" scrollIntoView={scrollIntoView}>
 */
export function useCoachScroller(ref: RefObject<ScrollView | null>) {
  const offsetRef = useRef(0);
  const { height: winH } = useWindowDimensions();

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const scrollIntoView = useCallback(
    (rect: CoachRect) => {
      // Land the target in the upper part of the screen: visible, and with
      // room below for the coach card.
      const targetTop = Math.max(16, Math.round(winH * 0.18));
      ref.current?.scrollTo({
        y: Math.max(0, offsetRef.current + rect.y - targetTop),
        animated: true,
      });
    },
    [ref, winH],
  );

  return { onScroll, scrollIntoView };
}
