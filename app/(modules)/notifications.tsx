import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, Trash2, CheckCheck } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ClinicalCard, EmptyState, ScreenHeader } from "@/components/ui";
import { theme } from "@/lib/theme";
import { useNotifications } from "@/hooks/useNotifications";
import { ScreenGradient } from "@/components/ScreenGradient";
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
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
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
        <FadeItem index={0}>
          <View className="flex-row items-center justify-between mt-2">
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => router.back()}
                className="h-10 w-10 items-center justify-center rounded-full bg-white active:opacity-80"
                style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
              >
                <ArrowLeft size={20} color={theme.colors.primary} />
              </Pressable>
              <ScreenHeader
                title="Notifications"
                subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
              />
            </View>
            {notifications.length > 0 && (
              <View className="flex-row gap-2">
                {unreadCount > 0 && (
                  <Pressable
                    onPress={markAllAsRead}
                    accessibilityRole="button"
                    accessibilityLabel="Mark all as read"
                    className="h-9 px-3 items-center justify-center rounded-full active:opacity-80"
                    style={{ backgroundColor: theme.colors.primarySoft }}
                  >
                    <CheckCheck size={16} color={theme.colors.primary} />
                  </Pressable>
                )}
                <Pressable
                  onPress={clearAll}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all notifications"
                  className="h-9 px-3 items-center justify-center rounded-full active:opacity-80"
                  style={{ backgroundColor: "#FEF2F2" }}
                >
                  <Trash2 size={16} color={theme.colors.danger} />
                </Pressable>
              </View>
            )}
          </View>
        </FadeItem>

        {/* Notifications list */}
        <View className="mt-5 gap-3">
          {notifications.length === 0 ? (
            <FadeItem index={1}>
              <ClinicalCard>
                <EmptyState
                  icon={Bell}
                  title="No notifications"
                  copy="Enable scan reminders or daily tips in profile settings."
                />
              </ClinicalCard>
            </FadeItem>
          ) : (
            notifications.map((notification, idx) => (
              <FadeItem key={notification.id} index={Math.min(1 + idx, 6)}>
                <Pressable
                  key={notification.id}
                  onPress={() => markAsRead(notification.id)}
                  className="flex-row items-start active:opacity-90"
                >
                  <ClinicalCard
                    className="flex-row items-start flex-1"
                    style={
                      notification.read
                        ? undefined
                        : { borderColor: theme.colors.primary }
                    }
                  >
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between">
                      <Text
                        className="text-[15px] flex-1"
                        style={{
                          color: notification.read
                            ? theme.colors.body
                            : theme.colors.ink,
                          fontWeight: notification.read ? "500" : "700",
                        }}
                        numberOfLines={1}
                      >
                        {notification.title}
                      </Text>
                      {!notification.read && (
                        <View
                          className="h-2 w-2 rounded-full ml-2"
                          style={{ backgroundColor: theme.colors.primary }}
                        />
                      )}
                    </View>
                    <Text className="text-sm mt-1" style={{ color: theme.colors.muted }}>
                      {notification.message}
                    </Text>
                    <Text className="text-xs mt-2" style={{ color: theme.colors.faint }}>
                      {formatTime(notification.created_at)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => deleteNotification(notification.id)}
                    className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
                  >
                    <Trash2 size={14} color={theme.colors.faint} />
                  </Pressable>
                  </ClinicalCard>
                </Pressable>
              </FadeItem>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
