import { View } from "react-native";
import { Tabs } from "expo-router";

import { AppTabBar, TAB_BAR_TINT } from "@/components/AppTabBar";
import { TAB_BAR_VARIANT } from "@/lib/tabs-config";
import { theme } from "@/lib/theme";

export default function Layout() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          // Rendered by AppTabBar (dark dock); keeps labels in sync for a11y.
          tabBarActiveTintColor: TAB_BAR_TINT.active,
          tabBarInactiveTintColor: TAB_BAR_TINT.inactive,
        }}
        // Switch styles with one flag in lib/tabs-config.ts:
        // TAB_BAR_VARIANT = "floating" | "docked"
        tabBar={(props: any) => (
          <AppTabBar {...props} variant={TAB_BAR_VARIANT} />
        )}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
          }}
        />
        <Tabs.Screen
          name="routine"
          options={{
            title: "Routine",
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{
            title: "Scan",
            tabBarAccessibilityLabel: "Scan skin",
          }}
        />
        <Tabs.Screen
          name="derma"
          options={{
            title: "Derma",
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
          }}
        />
      </Tabs>
    </View>
  );
}
