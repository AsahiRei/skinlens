import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/Text";
import { Tabs } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CalendarCheck2,
  CalendarDays,
  House,
  Inbox,
  UserRound,
  History,
} from "lucide-react-native";

import Animated from "react-native-reanimated";
import { useTabFocusStyle } from "@/components/motion";
import { TAB_BAR_VARIANT } from "@/lib/tabs-config";
import { usePendingRequestCount } from "@/hooks/useDoctorQueue";
import { theme } from "@/lib/theme";

const ACTIVE_FG = "#FFFFFF";
const INACTIVE = "#7E938A";
const ACTIVE_BG = "rgba(255, 255, 255, 0.18)";

type DoctorTabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (e: unknown) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

const TABS = [
  { name: "index", label: "Today", Icon: House },
  { name: "schedule", label: "Schedule", Icon: CalendarDays },
  { name: "requests", label: "Requests", Icon: Inbox },
  { name: "history", label: "History", Icon: History },
  { name: "profile", label: "Account", Icon: UserRound },
] as const;

function DoctorTabBar({ state, descriptors, navigation }: DoctorTabBarProps) {
  const insets = useSafeAreaInsets();
  const isFloating = TAB_BAR_VARIANT === "floating";
  const pendingCount = usePendingRequestCount();

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
            <DoctorTab
              key={route.key}
              focused={focused}
              label={label}
              Icon={Icon}
              badge={route.name === "requests" ? pendingCount : 0}
              onPress={onPress}
            />
          );
        })}
      </LinearGradient>
    </View>
  );
}

function DoctorTab({
  focused,
  label,
  Icon,
  badge,
  onPress,
}: {
  focused: boolean;
  label: string;
  Icon: typeof CalendarCheck2;
  badge: number;
  onPress: () => void;
}) {
  const { pillStyle, iconStyle } = useTabFocusStyle(focused, ACTIVE_BG);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${label}, ${badge} waiting` : label}
      accessibilityState={focused ? { selected: true } : {}}
      android_ripple={{ color: "transparent" }}
      onPress={onPress}
      hitSlop={6}
      style={styles.tabWrap}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.tabCol, pillStyle, pressed && { opacity: 0.7 }]}>
          <Animated.View style={iconStyle}>
            <Icon
              size={20}
              color={focused ? ACTIVE_FG : INACTIVE}
              strokeWidth={focused ? 2.2 : 1.9}
            />
            {badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
              </View>
            ) : null}
          </Animated.View>
          <Text style={[styles.tabLabel, focused && styles.tabLabelActive]} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      )}
    </Pressable>
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
          // Cross-fade between tabs; each screen's FadeItem stagger replays
          // on focus, so the content settles in after the fade.
          animation: "fade",
        }}
        tabBar={(props: unknown) => <DoctorTabBar {...(props as DoctorTabBarProps)} />}
      >
        <Tabs.Screen name="index" options={{ title: "Today" }} />
        <Tabs.Screen name="schedule" options={{ title: "Schedule" }} />
        <Tabs.Screen name="requests" options={{ title: "Requests" }} />
        <Tabs.Screen name="history" options={{ title: "History" }} />
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
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 18,
    minWidth: 58,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#10241A",
  },
  tabLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: INACTIVE,
  },
  tabLabelActive: {
    color: ACTIVE_FG,
    fontWeight: "700",
  },
});
