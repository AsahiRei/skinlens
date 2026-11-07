import { forwardRef } from "react";
import { Text as RNText, type TextProps } from "react-native";

/** The app-wide typeface, loaded once in `app/_layout.tsx` via `useFonts`. */
export const FONT_FAMILY = "Redaction10-Regular";

/**
 * Drop-in replacement for React Native's `<Text>` — identical API (including NativeWind's
 * `className`), but Redaction10 is applied by default.
 */
export const Text = forwardRef<InstanceType<typeof RNText>, TextProps>(function Text(
  { style, ...props },
  ref,
) {
  return <RNText {...props} ref={ref} style={[{ fontFamily: FONT_FAMILY }, style]} />;
});

Text.displayName = "Text";

export default Text;
