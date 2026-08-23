import { Tabs } from "expo-router";
import { View, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#15803D",
        tabBarInactiveTintColor: "#6b7280",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
          tabBarButton: ({ ref, ...props }) => (
            <Pressable
              {...props}
              android_ripple={{ color: "transparent" }}
              style={({ pressed }) => [
                { flex: 1, justifyContent: "center", alignItems: "center" },
                pressed && { opacity: 0.6 },
              ]}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="routine"
        options={{
          title: "Routine",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "list" : "list-outline"}
              size={size}
              color={color}
            />
          ),
          tabBarButton: ({ ref, ...props }) => (
            <Pressable
              {...props}
              android_ripple={{ color: "transparent" }}
              style={({ pressed }) => [
                { flex: 1, justifyContent: "center", alignItems: "center" },
                pressed && { opacity: 0.6 },
              ]}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarLabel: () => null,
          tabBarButton: ({ ref, ...props }) => (
            <Pressable
              {...props}
              android_ripple={{ color: "transparent" }}
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: "#15803D",
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 20,
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  }}
                >
                  <Ionicons name="scan" size={26} color="#fff" />
                </View>
              )}
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="derma"
        options={{
          title: "Derma",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "medkit" : "medkit-outline"}
              size={size}
              color={color}
            />
          ),
          tabBarButton: ({ ref, ...props }) => (
            <Pressable
              {...props}
              android_ripple={{ color: "transparent" }}
              style={({ pressed }) => [
                { flex: 1, justifyContent: "center", alignItems: "center" },
                pressed && { opacity: 0.6 },
              ]}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color}
            />
          ),
          tabBarButton: ({ ref, ...props }) => (
            <Pressable
              {...props}
              android_ripple={{ color: "transparent" }}
              style={({ pressed }) => [
                { flex: 1, justifyContent: "center", alignItems: "center" },
                pressed && { opacity: 0.6 },
              ]}
            />
          ),
        }}
      />
    </Tabs>
  );
}
