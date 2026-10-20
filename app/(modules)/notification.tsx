import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Bell, Trash2 } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  BackHeader,
  ClinicalCard,
  EmptyState,
  PrimaryButton,
  UiModal,
} from "@/components/ui";
import { theme } from "@/lib/theme";
import { useNotifications } from "@/hooks/useNotifications";

function typeLabel(type: string): string {
  if (type === "scan_reminder") return "Scan reminder";
  if (type === "daily_tip") return "Skin tip";
  return type;
}

export default function NotificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { notifications, markAsRead, deleteNotification } = useNotifications();
  const [confirmVisible, setConfirmVisible] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const notification = React.useMemo(
    () => notifications.find((n) => n.id === id),
    [notifications, id],
  );

  React.useEffect(() => {
    if (notification && !notification.read) {
      markAsRead(notification.id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification?.id]);

  const handleConfirmDelete = async () => {
    if (!notification) return;
    setDeleting(true);
    try {
      await deleteNotification(notification.id);
      setConfirmVisible(false);
      router.back();
    } finally {
      setDeleting(false);
    }
  };

  const handlePrimaryAction = () => {
    if (!notification) return;
    if (notification.type === "scan_reminder") {
      router.push("/(tabs)/scan");
    } else if (notification.type === "appointment_reply") {
      router.push("/(modules)/appointments");
    } else {
      router.push("/(tabs)/routine");
    }
  };

  if (!notification) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <View className="flex-1 px-5">
          <View className="mt-2">
            <BackHeader title="Notification" onBack={() => router.back()} />
          </View>
          <View className="mt-5">
            <ClinicalCard>
              <EmptyState
                icon={Bell}
                title="Not found"
                copy="This notification was deleted or is no longer available."
              />
            </ClinicalCard>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const fullDate = new Date(notification.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className="mt-2">
          <BackHeader
            title={typeLabel(notification.type)}
            subtitle={fullDate}
            onBack={() => router.back()}
            right={
              <Pressable
                onPress={() => setConfirmVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Delete notification"
                className="h-9 px-3 items-center justify-center rounded-full active:opacity-80"
                style={{ backgroundColor: "#FEF2F2" }}
              >
                <Trash2 size={16} color={theme.colors.danger} />
              </Pressable>
            }
          />
        </View>

        <ClinicalCard className="mt-5">
          <Text className="font-bold text-[20px] leading-7" style={{ color: theme.colors.ink }}>
            {notification.title}
          </Text>
          <Text className="text-[15px] leading-6 mt-2" style={{ color: theme.colors.body }}>
            {notification.message}
          </Text>
        </ClinicalCard>

        <View className="mt-5">
          <PrimaryButton
            label={notification.type === "scan_reminder" ? "Take scan" : "View routine"}
            onPress={handlePrimaryAction}
          />
        </View>
      </ScrollView>

      <UiModal
        visible={confirmVisible}
        onDismiss={() => setConfirmVisible(false)}
        title="Delete this notification?"
        message="This cannot be undone."
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
