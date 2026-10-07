import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "expo-router";

type TabNavigation = {
  addListener: (type: string, callback: () => void) => () => void;
  isFocused: () => boolean;
};

/**
 * Bumps a counter every time the screen regains focus, and every time its own
 * tab button is pressed again while it is already active. Entrance animations
 * keyed off this value can therefore replay instead of only running once on
 * mount.
 */
export function useRevealTrigger() {
  const [trigger, setTrigger] = useState(0);
  const isFirstFocus = useRef(true);
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      setTrigger((prev) => prev + 1);
    }, []),
  );

  useEffect(() => {
    const tabNavigation = navigation as unknown as TabNavigation;
    // Only screens inside a tab navigator ever receive tabPress, and only for
    // their own route, so this is a no-op on plain stack screens.
    return tabNavigation.addListener("tabPress", () => {
      if (!tabNavigation.isFocused()) return;
      setTrigger((prev) => prev + 1);
    });
  }, [navigation]);

  return trigger;
}
