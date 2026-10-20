import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { BackHeader, ClinicalCard, EmptyState, UiModal } from "@/components/ui";
import { theme } from "@/lib/theme";
import { useNotifications } from "@/hooks/useNotifications";
import { ScreenGradient } from "@/components/ScreenGradient";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(
    "en-US",
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

function typeLabel(type: string): string {
  if (type === "scan_reminder") return "Scan reminder";
  if (type === "daily_tip") return "Skin tip";
  if (type === "appointment_reply") return "Appointment update";
  return type;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, markAllAsRead, deleteNotification, refresh } =
    useNotifications();
  const [refreshing, setRefreshing] = React.useState(false);
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmVisible, setConfirmVisible] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Defensive: never render duplicate keys even if the provider briefly holds
  // two rows with the same id (see generateNotifications guard).
  const uniqueNotifications = React.useMemo(
    () => Array.from(new Map(notifications.map((n) => [n.id, n])).values()),
    [notifications],
  );
  const unreadCount = uniqueNotifications.filter((n) => !n.read).length;

  const openNotification = (id: string) => {
    router.push(`/(modules)/notification?id=${encodeURIComponent(id)}`);
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const handleConfirmDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) => deleteNotification(id)),
      );
      exitSelection();
      setConfirmVisible(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Header */}
        <View className="mt-2">
          <BackHeader
            title={selecting ? "Select" : "Notifications"}
            subtitle={
              selecting
                ? `${selected.size} selected`
                : unreadCount > 0
                  ? `${unreadCount} unread`
                  : undefined
            }
            onBack={() => (selecting ? exitSelection() : router.back())}
            rightClassName="flex-row items-center gap-1"
            right={
              <>
                {!selecting && uniqueNotifications.length > 0 && (
                  <View className="flex-row items-center gap-1">
                    {unreadCount > 0 && (
                      <Pressable
                        onPress={markAllAsRead}
                        accessibilityRole="button"
                        accessibilityLabel="Mark all as read"
                        className="h-9 w-9 items-center justify-center rounded-full active:opacity-80"
                        style={{ backgroundColor: theme.colors.primarySoft }}
                      >
                        <CheckCheck size={16} color={theme.colors.primary} />
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => setSelecting(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Select notifications to delete"
                      className="h-9 px-4 items-center justify-center rounded-full active:opacity-80"
                    >
                      <Text
                        className="font-semibold text-[14px]"
                        style={{ color: theme.colors.primary }}
                      >
                        Select
                      </Text>
                    </Pressable>
                  </View>
                )}
                {selecting && (
                  <View className="flex-row items-center gap-1">
                    <Pressable
                      onPress={exitSelection}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel selection"
                      className="h-9 px-3 items-center justify-center rounded-full active:opacity-80"
                    >
                      <Text
                        className="font-semibold text-[14px]"
                        style={{ color: theme.colors.muted }}
                      >
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setConfirmVisible(true)}
                      disabled={selected.size === 0}
                      accessibilityRole="button"
                      accessibilityLabel={
                        selected.size > 0
                          ? `Delete ${selected.size} selected notifications`
                          : "Delete selected notifications"
                      }
                      className="h-9 px-4 items-center justify-center rounded-full active:opacity-80"
                      style={{
                        backgroundColor:
                          selected.size > 0
                            ? theme.colors.danger
                            : theme.colors.cardBorder,
                      }}
                    >
                      <Text className="font-semibold text-[14px]" style={{ color: "#FFFFFF" }}>
                        {selected.size > 0 ? `Delete (${selected.size})` : "Delete"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            }
          />
        </View>

        {/* Notifications list */}
        <View className="mt-5 gap-3">
          {uniqueNotifications.length === 0 ? (
            <ClinicalCard>
              <EmptyState
                icon={Bell}
                title="No notifications"
                copy="New scan reminders and skin tips will show here."
              />
            </ClinicalCard>
          ) : (
            uniqueNotifications.map((notification) => {
              const isSelected = selected.has(notification.id);
              return (
                <Pressable
                  key={notification.id}
                  onPress={() =>
                    selecting ? toggleOne(notification.id) : openNotification(notification.id)
                  }
                  accessibilityRole={selecting ? "checkbox" : "button"}
                  accessibilityState={selecting ? { checked: isSelected } : undefined}
                  accessibilityLabel={
                    selecting
                      ? `${notification.title}, ${isSelected ? "selected" : "not selected"}`
                      : `${notification.title}. ${notification.message}`
                  }
                  className="active:opacity-90"
                >
                  <ClinicalCard className="flex-row items-center">
                    {selecting && (
                      <View
                        className="h-6 w-6 rounded-full items-center justify-center mr-3"
                        style={
                          isSelected
                            ? { backgroundColor: theme.colors.primary }
                            : { borderWidth: 1.5, borderColor: theme.colors.faint }
                        }
                      >
                        {isSelected && <Check size={14} color="#FFFFFF" />}
                      </View>
                    )}
                    {!selecting && !notification.read && (
                      <View
                        className="rounded-full mr-3"
                        style={{
                          width: 3,
                          alignSelf: "stretch",
                          backgroundColor: theme.colors.primary,
                        }}
                      />
                    )}
                    <View className="flex-1">
                      <Text
                        className="text-[15px]"
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
                      <Text
                        className="text-sm mt-1"
                        style={{ color: theme.colors.muted }}
                        numberOfLines={2}
                      >
                        {notification.message}
                      </Text>
                      <Text className="text-xs mt-2" style={{ color: theme.colors.faint }}>
                        {typeLabel(notification.type)}, {formatDate(notification.created_at)}
                      </Text>
                    </View>
                  </ClinicalCard>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <UiModal
        visible={confirmVisible}
        onDismiss={() => setConfirmVisible(false)}
        title="Delete notifications?"
        message={`Delete ${selected.size} selected notification${selected.size === 1 ? "" : "s"}? This cannot be undone.`}
        icon={Trash2}
        tone="danger"
        actions={[
          { label: "Cancel", onPress: () => setConfirmVisible(false), kind: "ghost" },
          {
            label: deleting ? "Deleting…" : "Delete",
            onPress: handleConfirmDelete,
            kind: "danger",
            loading: deleting,
            disabled: deleting,
          },
        ]}
      />
    </SafeAreaView>
  );
}
