import type { ComponentType, ReactNode, Ref } from "react";
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import type { ScrollViewProps, StyleProp, ViewStyle } from "react-native";

/**
 * The keyboard-controller native module only exists after the dev client
 * is rebuilt (`npx expo run:android`). Until then, `require` throws the
 * "doesn't seem to be linked" error — catch it and fall back to stock
 * React Native components so the app still boots (without the fix).
 * After a rebuild the real components load and the fix activates.
 */
function loadController(): Record<string, any> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-keyboard-controller");
  } catch {
    return null;
  }
}

const controller = loadController();

export const IS_KEYBOARD_CONTROLLER_AVAILABLE = controller !== null;

if (__DEV__ && !controller) {
  console.warn(
    "[keyboard] react-native-keyboard-controller native module not found. " +
      "Rebuild your dev client (`npx expo run:android`) to enable the keyboard fix.",
  );
}

function Passthrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const SafeKeyboardProvider: ComponentType<{ children: ReactNode }> =
  controller?.KeyboardProvider ?? Passthrough;

type AvoidingProps = {
  children: ReactNode;
  keyboardVerticalOffset?: number;
  style?: StyleProp<ViewStyle>;
};

/** Library KeyboardAvoidingView when linked, RN fallback otherwise. */
export function SafeKeyboardAvoidingView({
  children,
  keyboardVerticalOffset = 0,
  style,
}: AvoidingProps) {
  if (controller?.KeyboardAvoidingView) {
    const C = controller.KeyboardAvoidingView;
    return (
      <C
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={style}
      >
        {children}
      </C>
    );
  }
  return (
    <RNKeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={style}
    >
      {children}
    </RNKeyboardAvoidingView>
  );
}

type AwareScrollProps = ScrollViewProps & {
  children: ReactNode;
  /** React 19 passes ref as a plain prop — function components have to
   * declare and forward it explicitly (it is not part of ScrollViewProps). */
  ref?: Ref<ScrollView>;
};

/** Library KeyboardAwareScrollView when linked, plain ScrollView otherwise. */
export function SafeKeyboardAwareScrollView({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps = "handled",
  showsVerticalScrollIndicator = false,
  style,
  ref,
  ...rest
}: AwareScrollProps) {
  if (controller?.KeyboardAwareScrollView) {
    const C = controller.KeyboardAwareScrollView;
    return (
      <C
        style={style}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        bottomOffset={24}
        extraKeyboardSpace={8}
        ref={ref}
        {...rest}
      >
        {children}
      </C>
    );
  }
  return (
    <ScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      ref={ref}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
