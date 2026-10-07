import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Data-fetch trigger: bumps when the screen regains focus (skips first mount).
 * Intentionally separate from useRevealTrigger — tab re-press replays
 * animations but must NOT refetch network data.
 */
export function useFocusTrigger() {
  const [trigger, setTrigger] = useState(0);
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      setTrigger((prev) => prev + 1);
    }, []),
  );

  return trigger;
}
