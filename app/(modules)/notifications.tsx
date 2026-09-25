import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, Trash2, CheckCheck } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useNotifications } from "@/hooks/useNotifications";
function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, markAsRead, markAllAsRead, deleteNotification, clearAll, refresh } =
    useNotifications();
  const [refreshing, setRefreshing] = React.useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#15803D"
            colors={["#15803D"]}
          />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:opacity-80"
            >
              <ArrowLeft size={20} color="#15803D" />
            </Pressable>
            <View>
              <Text className="font-bold text-green-700 text-2xl">
                Notifications
              </Text>
              {unreadCount > 0 && (
                <Text className="text-xs text-gray-500">
                  {unreadCount} unread
                </Text>
              )}
            </View>
          </View>
          {notifications.length > 0 && (
            <View className="flex-row gap-2">
              {unreadCount > 0 && (
                <Pressable
                  onPress={markAllAsRead}
                  className="h-9 px-3 items-center justify-center rounded-full bg-green-50 active:opacity-80"
                >
                  <CheckCheck size={16} color="#15803D" />
                </Pressable>
              )}
              <Pressable
                onPress={clearAll}
                className="h-9 px-3 items-center justify-center rounded-full bg-red-50 active:opacity-80"
              >
                <Trash2 size={16} color="#EF4444" />
              </Pressable>
            </View>
          )}
        </View>

        {/* Notifications list */}
        <View className="mt-5 gap-3">
          {notifications.length === 0 ? (
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-12 px-4 items-center">
              <Bell size={32} color="#D1D5DB" />
              <Text className="text-sm text-gray-400 mt-3 text-center">
                No notifications yet
              </Text>
              <Text className="text-xs text-gray-300 mt-1 text-center">
                Enable scan reminders or daily tips in your profile settings
              </Text>
            </View>
          ) : (
            notifications.map((notification) => (
              <Pressable
                key={notification.id}
                onPress={() => markAsRead(notification.id)}
                className={`bg-white rounded-2xl border shadow-sm py-4 px-4 flex-row items-start active:opacity-90 ${
                  notification.read ? "border-gray-100" : "border-green-200"
                }`}
              >
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text
                      className={`text-[15px] flex-1 ${
                        notification.read
                          ? "font-medium text-gray-700"
                          : "font-bold text-gray-900"
                      }`}
                      numberOfLines={1}
                    >
                      {notification.title}
                    </Text>
                    {!notification.read && (
                      <View className="h-2 w-2 rounded-full bg-green-700 ml-2" />
                    )}
                  </View>
                  <Text className="text-sm text-gray-500 mt-1">
                    {notification.message}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-2">
                    {formatTime(notification.created_at)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => deleteNotification(notification.id)}
                  className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
                >
                  <Trash2 size={14} color="#9CA3AF" />
                </Pressable>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
