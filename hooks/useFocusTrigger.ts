import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

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
