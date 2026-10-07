import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";

import { theme } from "@/lib/theme";

export function ScreenGradient() {
  return (
    <LinearGradient
      colors={[...theme.gradients.screen]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
