import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarCheck2, House, UserRound } from "lucide-react-native";

import { TAB_BAR_VARIANT } from "@/lib/tabs-config";
import { theme } from "@/lib/theme";

const ACTIVE_FG = "#FFFFFF";
const INACTIVE = "#7E938A";

type DoctorTabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (e: unknown) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

const TABS = [
  { name: "index", label: "Home", Icon: House },
  { name: "schedule", label: "Schedule", Icon: CalendarCheck2 },
  { name: "profile", label: "Account", Icon: UserRound },
] as const;

function DoctorTabBar({ state, descriptors, navigation }: DoctorTabBarProps) {
  const insets = useSafeAreaInsets();
  const isFloating = TAB_BAR_VARIANT === "floating";

  return (
    <View
      style={[
        styles.host,
        isFloating
          ? { paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 10) + 6 }
          : { paddingBottom: insets.bottom },
      ]}
      pointerEvents="box-none"
    >
      <LinearGradient
        colors={[...theme.gradients.dark]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.bar, isFloating ? styles.barFloating : styles.barDocked]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = TABS.find((t) => t.name === route.name);
          const options = descriptors[route.key]?.options ?? {};
          const label = options.title ?? meta?.label ?? route.name;
          const Icon = meta?.Icon ?? CalendarCheck2;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={focused ? { selected: true } : {}}
              android_ripple={{ color: "transparent" }}
              onPress={onPress}
              hitSlop={6}
              style={styles.tabWrap}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.tabCol,
                    focused && styles.tabColActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Icon
                    size={20}
                    color={focused ? ACTIVE_FG : INACTIVE}
                    strokeWidth={focused ? 2.2 : 1.9}
                  />
                  <Text
                    style={[styles.tabLabel, focused && styles.tabLabelActive]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </LinearGradient>
    </View>
  );
}

export default function DoctorLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: ACTIVE_FG,
          tabBarInactiveTintColor: INACTIVE,
        }}
        tabBar={(props: unknown) => (
          <DoctorTabBar {...(props as DoctorTabBarProps)} />
        )}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="schedule" options={{ title: "Schedule" }} />
        <Tabs.Screen name="profile" options={{ title: "Account" }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
  },
  barFloating: {
    borderRadius: 26,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 74,
    shadowColor: theme.colors.ink,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 12,
  },
  barDocked: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 72,
  },
  tabWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCol: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: "hidden",
    minWidth: 76,
  },
  tabColActive: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 20,
    overflow: "hidden",
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: INACTIVE,
  },
  tabLabelActive: {
    color: ACTIVE_FG,
    fontWeight: "700",
  },
});
