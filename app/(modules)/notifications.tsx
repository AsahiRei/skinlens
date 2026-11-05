import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { Bell, Check, CheckCheck, ChevronRight, Trash2 } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { BackHeader, EmptyState, UiModal } from "@/components/ui";
import { cardShadow, theme } from "@/lib/theme";
import { useNotifications } from "@/hooks/useNotifications";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  NOTIFICATION_FILTERS,
  getNotificationMeta,
  groupByDay,
  matchesFilter,
  relativeTime,
  type NotificationFilter,
} from "@/lib/notification-meta";
import type { Notification } from "@/types/schema";

const EMPTY_COPY: Record<NotificationFilter, { title: string; copy: string }> = {
  all: {
    title: "You're all caught up",
    copy: "Scan reminders, skin tips and replies from your clinic will show up here.",
  },
  unread: { title: "No unread notifications", copy: "Everything here has been read." },
  appointments: {
    title: "No appointment updates",
    copy: "When a clinic confirms, declines or completes your visit, you'll see it here.",
  },
  skin: {
    title: "No skin care updates",
    copy: "Turn on scan reminders or daily tips in Profile → Notifications.",
  },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, markAllAsRead, deleteNotification, refresh } =
    useNotifications();
  const [refreshing, setRefreshing] = React.useState(false);
  const [filter, setFilter] = React.useState<NotificationFilter>("all");
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmVisible, setConfirmVisible] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Defensive: never render duplicate keys even if the provider briefly holds
  // two rows with the same id (see generateNotifications guard). Always newest
  // first so the day groups read top-down.
  const uniqueNotifications = React.useMemo(
    () =>
      Array.from(new Map(notifications.map((n) => [n.id, n])).values()).sort(
        (a, b) => b.created_at.localeCompare(a.created_at),
      ),
    [notifications],
  );
  const unreadCount = uniqueNotifications.filter((n) => !n.read).length;

  const counts = React.useMemo(() => {
    const c = {} as Record<NotificationFilter, number>;
    for (const f of NOTIFICATION_FILTERS) {
      c[f.key] = uniqueNotifications.filter((n) => matchesFilter(n, f.key)).length;
    }
    return c;
  }, [uniqueNotifications]);

  const visible = React.useMemo(
    () => uniqueNotifications.filter((n) => matchesFilter(n, filter)),
    [uniqueNotifications, filter],
  );
  const sections = React.useMemo(() => groupByDay(visible), [visible]);

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

  const allVisibleSelected =
    visible.length > 0 && visible.every((n) => selected.has(n.id));
  const toggleAllVisible = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((n) => n.id)));
  };

  const startSelection = (id?: string) => {
    setSelecting(true);
    if (id) setSelected(new Set([id]));
  };

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const handleConfirmDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await Promise.all(Array.from(selected).map((id) => deleteNotification(id)));
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

  const empty = EMPTY_COPY[filter];

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: selecting ? 120 : 32 }}
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
        <View className="mt-2 px-5">
          <BackHeader
            title={selecting ? `${selected.size} selected` : "Notifications"}
            subtitle={
              selecting
                ? "Tap items to select"
                : unreadCount > 0
                  ? `${unreadCount} unread`
                  : "All caught up"
            }
            onBack={() => (selecting ? exitSelection() : router.back())}
            right={
              uniqueNotifications.length === 0 ? null : selecting ? (
                <Pressable
                  onPress={toggleAllVisible}
                  accessibilityRole="button"
                  className="h-9 px-3 items-center justify-center rounded-full active:opacity-80"
                >
                  <Text className="font-semibold text-[14px]" style={{ color: theme.colors.primary }}>
                    {allVisibleSelected ? "Clear" : "Select all"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => startSelection()}
                  accessibilityRole="button"
                  accessibilityLabel="Select notifications to delete"
                  className="h-9 px-3 items-center justify-center rounded-full active:opacity-80"
                >
                  <Text className="font-semibold text-[14px]" style={{ color: theme.colors.primary }}>
                    Edit
                  </Text>
                </Pressable>
              )
            }
          />
        </View>

        {/* Filter chips */}
        <View className="pt-4 pb-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          >
            {NOTIFICATION_FILTERS.map((f) => {
              const active = filter === f.key;
              const count = counts[f.key];
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  className="flex-row items-center rounded-full px-4 h-9 active:opacity-80"
                  style={{
                    backgroundColor: active ? theme.colors.ink : theme.colors.card,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.ink : theme.colors.cardBorder,
                  }}
                >
                  <Text
                    className="text-[13px] font-semibold"
                    style={{ color: active ? "#FFFFFF" : theme.colors.body }}
                  >
                    {f.label}
                  </Text>
                  {count > 0 && f.key !== "all" && (
                    <Text
                      className="text-[12px] font-bold ml-1.5"
                      style={{ color: active ? "#A7F3D0" : theme.colors.faint }}
                    >
                      {count}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View className="px-5">
          {!selecting && unreadCount > 0 && filter !== "appointments" && filter !== "skin" && (
            <Pressable
              onPress={markAllAsRead}
              accessibilityRole="button"
              className="flex-row items-center self-end gap-1.5 py-1 mt-1 active:opacity-70"
            >
              <CheckCheck size={14} color={theme.colors.primary} />
              <Text className="text-[13px] font-semibold" style={{ color: theme.colors.primary }}>
                Mark all as read
              </Text>
            </Pressable>
          )}

          {sections.length === 0 ? (
            <View className="mt-10">
              <EmptyState icon={Bell} title={empty.title} copy={empty.copy} />
            </View>
          ) : (
            sections.map((section) => (
              <View key={section.title} className="mt-4">
                <Text
                  className="text-[12px] font-bold uppercase mb-2 ml-1"
                  style={{ color: theme.colors.muted, letterSpacing: 0.8 }}
                >
                  {section.title}
                </Text>
                <View
                  className="bg-white overflow-hidden"
                  style={{
                    borderRadius: theme.radius.card,
                    borderWidth: 1,
                    borderColor: theme.colors.cardBorder,
                    ...cardShadow,
                  }}
                >
                  {section.items.map((n, i) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      first={i === 0}
                      selecting={selecting}
                      selected={selected.has(n.id)}
                      onPress={() => (selecting ? toggleOne(n.id) : openNotification(n.id))}
                      onLongPress={() => !selecting && startSelection(n.id)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}

          {!selecting && uniqueNotifications.length > 0 && (
            <Text className="text-[12px] text-center mt-6" style={{ color: theme.colors.faint }}>
              Long-press a notification to select it
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Bottom action bar while selecting */}
      {selecting && (
        <View
          className="absolute left-0 right-0 bottom-0 px-5 pt-3 pb-8 flex-row gap-3"
          style={{
            backgroundColor: theme.colors.card,
            borderTopWidth: 1,
            borderTopColor: theme.colors.cardBorder,
          }}
        >
          <Pressable
            onPress={exitSelection}
            accessibilityRole="button"
            className="flex-1 h-12 rounded-full items-center justify-center active:opacity-80"
            style={{ borderWidth: 1.5, borderColor: theme.colors.cardBorder }}
          >
            <Text className="font-semibold text-[15px]" style={{ color: theme.colors.body }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setConfirmVisible(true)}
            disabled={selected.size === 0}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${selected.size} selected notifications`}
            className="flex-1 h-12 rounded-full flex-row gap-2 items-center justify-center active:opacity-80"
            style={{
              backgroundColor: selected.size > 0 ? theme.colors.danger : theme.colors.cardBorder,
            }}
          >
            <Trash2 size={16} color="#FFFFFF" />
            <Text className="font-semibold text-[15px]" style={{ color: "#FFFFFF" }}>
              {selected.size > 0 ? `Delete (${selected.size})` : "Delete"}
            </Text>
          </Pressable>
        </View>
      )}

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

function NotificationRow({
  notification: n,
  first,
  selecting,
  selected,
  onPress,
  onLongPress,
}: {
  notification: Notification;
  first: boolean;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const meta = getNotificationMeta(n);
  const Icon = meta.icon;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={`${n.read ? "" : "Unread. "}${meta.label}. ${n.title}. ${n.message}`}
      className="flex-row px-4 py-3.5 active:opacity-80"
      style={{
        backgroundColor: selected ? theme.colors.primarySoft : n.read ? "#FFFFFF" : "#F7FCF9",
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.colors.divider,
      }}
    >
      {selecting && (
        <View
          className="h-6 w-6 rounded-full items-center justify-center mr-3 self-center"
          style={
            selected
              ? { backgroundColor: theme.colors.primary }
              : { borderWidth: 1.5, borderColor: theme.colors.faint }
          }
        >
          {selected && <Check size={14} color="#FFFFFF" />}
        </View>
      )}

      <View
        className="h-10 w-10 rounded-xl items-center justify-center mr-3"
        style={{ backgroundColor: meta.tint }}
      >
        <Icon size={18} color={meta.color} />
      </View>

      <View className="flex-1">
        <View className="flex-row items-center">
          <Text
            className="text-[12px] font-semibold flex-1"
            style={{ color: meta.color }}
            numberOfLines={1}
          >
            {meta.label}
          </Text>
          <Text className="text-[12px] ml-2" style={{ color: theme.colors.faint }}>
            {relativeTime(n.created_at)}
          </Text>
          {!n.read && (
            <View
              className="h-2 w-2 rounded-full ml-2"
              style={{ backgroundColor: theme.colors.primary }}
            />
          )}
        </View>
        <Text
          className="text-[15px] mt-0.5"
          style={{
            color: theme.colors.ink,
            fontWeight: n.read ? "600" : "700",
          }}
          numberOfLines={1}
        >
          {n.title}
        </Text>
        <Text
          className="text-[13px] leading-[18px] mt-0.5"
          style={{ color: n.read ? theme.colors.muted : theme.colors.body }}
          numberOfLines={2}
        >
          {n.message}
        </Text>
      </View>

      {!selecting && (
        <View className="self-center ml-2">
          <ChevronRight size={16} color={theme.colors.faint} />
        </View>
      )}
    </Pressable>
  );
}
