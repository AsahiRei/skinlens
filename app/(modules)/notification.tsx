import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Bell, Trash2 } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  ClinicalCard,
  EmptyState,
  PrimaryButton,
  ScreenHeader,
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
    } else {
      router.push("/(tabs)/routine");
    }
  };

  if (!notification) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
        <ScreenGradient />
        <View className="flex-1 px-5">
          <View className="flex-row items-center gap-3 mt-2">
            <Pressable
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-white active:opacity-80"
              style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
            >
              <ArrowLeft size={20} color={theme.colors.primary} />
            </Pressable>
            <ScreenHeader title="Notification" />
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
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
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
              title={typeLabel(notification.type)}
              subtitle={fullDate}
            />
          </View>
          <Pressable
            onPress={() => setConfirmVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Delete notification"
            className="h-9 px-3 items-center justify-center rounded-full active:opacity-80"
            style={{ backgroundColor: "#FEF2F2" }}
          >
            <Trash2 size={16} color={theme.colors.danger} />
          </Pressable>
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
