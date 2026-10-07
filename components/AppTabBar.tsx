import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ClipboardList,
  House,
  ScanLine,
  Stethoscope,
  UserRound,
} from "lucide-react-native";

import type { TabBarVariant } from "@/lib/tabs-config";
import { theme } from "@/lib/theme";

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<
    string,
    { options: { title?: string; tabBarAccessibilityLabel?: string } }
  >;
  navigation: {
    emit: (e: any) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  variant?: TabBarVariant;
};

const INACTIVE = "#7E938A";
const ACTIVE_BG = "rgba(255, 255, 255, 0.18)";
const ACTIVE_FG = "#FFFFFF";
const FAB_BG = "#FFFFFF";
const FAB_ICON = "#15803D";

export const TAB_BAR_TINT = { active: ACTIVE_FG, inactive: INACTIVE } as const;

const ICONS: Record<string, typeof House> = {
  index: House,
  routine: ClipboardList,
  scan: ScanLine,
  derma: Stethoscope,
  profile: UserRound,
};

const LABELS: Record<string, string> = {
  index: "Home",
  routine: "Routine",
  scan: "Scan",
  derma: "Derma",
  profile: "Profile",
};

const TAB_NAMES = ["index", "routine", "scan", "derma", "profile"];

/** Maps the current URL to a tab name. Null when not on a tab route. */
function pathToTab(pathname: string): string | null {
  if (pathname === "/" || pathname === "/index") return "index";
  for (const name of TAB_NAMES) {
    if (name === "index") continue;
    if (pathname === `/${name}` || pathname.startsWith(`/${name}/`)) {
      return name;
    }
  }
  return null;
}

function SideTab({
  focused,
  label,
  accessibilityLabel,
  Icon,
  onPress,
}: {
  focused: boolean;
  label: string;
  accessibilityLabel?: string;
  Icon: typeof House;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={focused ? { selected: true } : {}}
      android_ripple={{ color: "transparent" }}
      onPress={onPress}
      hitSlop={6}
      style={styles.sideWrap}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.sideCol,
            focused && styles.sideColActive,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon
            size={19}
            color={focused ? ACTIVE_FG : INACTIVE}
            strokeWidth={focused ? 2.2 : 1.9}
          />
          <Text
            style={[styles.sideLabel, focused && styles.sideLabelActive]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function ScanTab({
  focused,
  accessibilityLabel,
  onPress,
}: {
  focused: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? "Scan skin"}
      accessibilityState={focused ? { selected: true } : {}}
      android_ripple={{ color: "transparent" }}
      onPress={onPress}
      hitSlop={6}
      style={styles.scanWrap}
    >
      {({ pressed }) => (
        <>
          <View
            style={[styles.fab, pressed && { opacity: 0.85 }]}
          >
            <ScanLine size={22} color={FAB_ICON} strokeWidth={2.4} />
          </View>
          <Text style={[styles.scanLabel, focused && styles.scanLabelActive]}>
            Scan
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function AppTabBar({
  state,
  descriptors,
  navigation,
  variant = "floating",
}: TabBarProps) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isFloating = variant === "floating";
  // Source of truth for the highlight is the URL, not the navigator state
  // object, so the active pill can't go stale after navigation.
  const activeByPath = pathToTab(pathname);

  return (
    <View
      style={[
        styles.host,
        isFloating
          ? {
              paddingHorizontal: 12,
              paddingBottom: Math.max(insets.bottom, 10) + 6,
            }
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
          const focused =
            activeByPath != null
              ? route.name === activeByPath
              : state.index === index;
          const options = descriptors[route.key]?.options ?? {};
          const label = options.title ?? LABELS[route.name] ?? route.name;

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

          if (route.name === "scan") {
            return (
              <ScanTab
                key={route.key}
                focused={focused}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                onPress={onPress}
              />
            );
          }

          return (
            <SideTab
              key={route.key}
              focused={focused}
              label={label}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              Icon={ICONS[route.name] ?? House}
              onPress={onPress}
            />
          );
        })}
      </LinearGradient>
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
    shadowColor: "#10241A",
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
    shadowColor: "#10241A",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  sideWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sideCol: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: "hidden",
    minWidth: 56,
  },
  sideColActive: {
    backgroundColor: ACTIVE_BG,
  },
  sideLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: INACTIVE,
  },
  sideLabelActive: {
    color: ACTIVE_FG,
    fontWeight: "700",
  },
  scanWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: FAB_BG,
    justifyContent: "center",
    alignItems: "center",
    marginTop: -30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  scanLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: INACTIVE,
  },
  scanLabelActive: {
    color: ACTIVE_FG,
    fontWeight: "700",
  },
});
