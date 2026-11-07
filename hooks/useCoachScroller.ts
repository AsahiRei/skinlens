import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import {
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from "react-native";

import type { CoachRect } from "@/components/TutorialCoach";

/** Pairs a scrollable with the tutorial coach so it can scroll a target back into view. */
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
