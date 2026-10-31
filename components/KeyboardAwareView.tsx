import type { ReactNode, Ref } from "react";
import { StyleSheet } from "react-native";
import type { ScrollView, ScrollViewProps } from "react-native";
import {
  SafeKeyboardAvoidingView,
  SafeKeyboardAwareScrollView,
} from "@/components/keyboard-safe";

type KeyboardAvoidingWrapperProps = {
  children: ReactNode;
  /** Extra offset added on top of the keyboard height. Defaults to 0. */
  keyboardVerticalOffset?: number;
};

/**
 * Non-scrolling keyboard wrapper (chat, pager flows, tab toggles).
 * Uses react-native-keyboard-controller when its native module is linked
 * (dev client rebuilt), otherwise falls back to RN's KeyboardAvoidingView.
 */
export function KeyboardAvoidingWrapper({
  children,
  keyboardVerticalOffset = 0,
}: KeyboardAvoidingWrapperProps) {
  return (
    <SafeKeyboardAvoidingView
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={styles.flex}
    >
      {children}
    </SafeKeyboardAvoidingView>
  );
}

type KeyboardAwareScrollProps = ScrollViewProps & {
  children: ReactNode;
  /** React 19 passes ref as a plain prop — function components have to
   * declare and forward it explicitly (it is not part of ScrollViewProps). */
  ref?: Ref<ScrollView>;
};

/**
 * Scrollable form wrapper. With the native module linked it automatically
 * scrolls the focused TextInput above the keyboard (which plain ScrollView
 * does not do on Android); otherwise it behaves as a plain ScrollView.
 */
export function KeyboardAwareScroll({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps = "handled",
  showsVerticalScrollIndicator = false,
  ref,
  ...rest
}: KeyboardAwareScrollProps) {
  return (
    <SafeKeyboardAwareScrollView
      ref={ref}
      style={styles.flex}
      contentContainerStyle={[styles.grow, contentContainerStyle]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      {...rest}
    >
      {children}
    </SafeKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
