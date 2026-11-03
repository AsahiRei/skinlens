import { forwardRef } from "react";
import { Text as RNText, type TextProps } from "react-native";

/**
 * The app-wide typeface, loaded once in `app/_layout.tsx` via `useFonts`.
 * Every `<Text>` in the app renders in Redaction10 unless it opts out.
 */
export const FONT_FAMILY = "Redaction10-Regular";

/**
 * Drop-in replacement for React Native's `<Text>` — identical API (including
 * NativeWind's `className`), but Redaction10 is applied by default.
 *
 * The default is prepended to `style`, so an explicit `style` prop or a
 * `font-*` className passed by the caller always wins over it.
 *
 * Import this instead of `Text` from "react-native":
 *
 *   import { Text } from "@/components/Text";
 */
export const Text = forwardRef<InstanceType<typeof RNText>, TextProps>(
  function Text({ style, ...props }, ref) {
    return (
      <RNText
        {...props}
        ref={ref}
        style={[{ fontFamily: FONT_FAMILY }, style]}
      />
    );
  },
);

Text.displayName = "Text";

export default Text;
