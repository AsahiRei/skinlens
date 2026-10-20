import type React from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { ArrowLeft } from "lucide-react-native";

import { cardShadow, theme } from "@/lib/theme";

/* ---------- Screen header: title + subtitle, one style everywhere ---------- */
export function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="mt-1">
      <Text
        className="text-[24px] font-bold mt-1"
        style={{ color: theme.colors.ink }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-[13px] mt-1" style={{ color: theme.colors.muted }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- Back chip: the single back affordance for every stack screen
 * h-9 / icon 18 is the app-wide standard (matches the tab dock rhythm); a few
 * screens used h-10 / icon 20 and read visibly larger than their neighbours. */
export function BackChip({
  onPress,
  label = "Go back",
}: {
  onPress: () => void;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className="h-9 w-9 items-center justify-center rounded-full bg-white active:opacity-70"
      style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <ArrowLeft size={18} color={theme.colors.primary} />
    </Pressable>
  );
}

/* ---------- Back header: back chip + ScreenHeader (+ optional right slot).
 * Wraps ScreenHeader in flex-1 so a right-hand action is pushed to the edge
 * instead of colliding with the title. */
export function BackHeader({
  title,
  subtitle,
  onBack,
  right,
  rightClassName = "",
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  rightClassName?: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      {onBack ? <BackChip onPress={onBack} /> : null}
      <View className="flex-1">
        <ScreenHeader title={title} subtitle={subtitle} />
      </View>
      {right ? <View className={rightClassName}>{right}</View> : null}
    </View>
  );
}

/* ---------- Card: the only card style in the app ---------- */
export function ClinicalCard({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.ComponentProps<typeof View>["style"];
}) {
  return (
    <View
      className={`bg-white px-4 py-4 ${className}`}
      style={{
        borderRadius: theme.radius.card,
        borderWidth: 1,
        borderColor: theme.colors.cardBorder,
        ...cardShadow,
        ...((style as object) ?? {}),
      }}
    >
      {children}
    </View>
  );
}

/* ---------- Icon badge: one size language (lg / md / sm) ---------- */
export function IconBadge({
  icon: Icon,
  size = "lg",
  tone = "primary",
}: {
  icon: LucideIcon;
  size?: "lg" | "md" | "sm";
  tone?: "primary" | "soft" | "warning";
}) {
  const dims =
    size === "lg"
      ? "h-12 w-12 rounded-2xl"
      : size === "md"
        ? "h-10 w-10 rounded-xl"
        : "h-8 w-8 rounded-full";
  const dimsStyle =
    size === "lg"
      ? { height: 48, width: 48, borderRadius: 16 }
      : size === "md"
        ? { height: 40, width: 40, borderRadius: 12 }
        : { height: 32, width: 32, borderRadius: 999 };
  const bg =
    tone === "primary"
      ? theme.colors.primary
      : tone === "warning"
        ? "#FEF3C7"
        : theme.colors.primarySoft;
  const iconColor =
    tone === "primary" ? "#FFFFFF" : tone === "warning" ? "#B45309" : theme.colors.primary;
  const iconSize = size === "lg" ? 22 : size === "md" ? 18 : 15;
  if (tone === "primary") {
    return (
      <LinearGradient
        colors={[...theme.gradients.icon]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[dimsStyle, { alignItems: "center", justifyContent: "center" }]}
      >
        <Icon size={iconSize} color="#FFFFFF" />
      </LinearGradient>
    );
  }
  return (
    <View
      className={`${dims} items-center justify-center`}
      style={{ backgroundColor: bg }}
    >
      <Icon size={iconSize} color={iconColor} />
    </View>
  );
}

/* ---------- Buttons: one primary / one secondary / one ghost ----------
 * Primary is the dark pine→ink gradient (expo-linear-gradient, SDK 57),
 * horizontal — same family as the tab dock, hero banners and auth tabs.
 * Secondary / ghost stay flat so hierarchy stays clear. */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon: Icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className="rounded-full active:opacity-80"
      style={{ borderRadius: theme.radius.pill, overflow: "hidden" }}
    >
      <LinearGradient
        colors={
          isDisabled
            ? [...theme.gradients.disabled]
            : [...theme.gradients.dark]
        }
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        className="py-4 px-5 flex-row items-center justify-center gap-2"
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            {Icon ? <Icon size={16} color="#FFFFFF" /> : null}
            <Text className="font-bold text-white text-[15px]">{label}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

/* ---------- Hero CTA: dark gradient banner for the 1–2 hero cards ----------
 * Use for "Scan Your Skin" (home) and "Find Nearby" (derma) — the only
 * large dark surfaces in the app. Everything else stays flat clinical white. */
export function GradientHeroCta({
  icon: Icon,
  title,
  subtitle,
  onPress,
  accessory,
  accessibilityLabel,
  disabled,
  className = "mt-4",
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onPress: () => void;
  accessory?: React.ReactNode;
  accessibilityLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      className={`${className} active:opacity-90`}
      style={{ borderRadius: 20, overflow: "hidden", opacity: disabled ? 0.7 : 1 }}
    >
      <LinearGradient
        colors={[...theme.gradients.dark]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          borderRadius: 20,
          paddingVertical: 16,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View className="flex-row items-center gap-3 flex-1">
          <LinearGradient
            colors={[...theme.gradients.icon]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              height: 48,
              width: 48,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={22} color="white" />
          </LinearGradient>
          <View className="flex-col flex-1">
            <Text className="font-bold text-white text-[15px]">{title}</Text>
            <Text className="text-xs mt-0.5" style={{ color: "#A7C4B2" }}>
              {subtitle}
            </Text>
          </View>
        </View>
        {accessory ?? null}
      </LinearGradient>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon: Icon,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-full py-4 px-5 flex-row items-center justify-center gap-2 active:opacity-80 bg-white"
      style={{ borderWidth: 1.5, borderColor: theme.colors.primary }}
    >
      {Icon ? <Icon size={16} color={theme.colors.primary} /> : null}
      <Text
        className="font-bold text-[15px]"
        style={{ color: theme.colors.primary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------- Pill: counts, status, metadata ---------- */
export function Pill({
  label,
  tone = "primary",
}: {
  label: string;
  tone?: "primary" | "neutral" | "warning";
}) {
  const bg =
    tone === "primary"
      ? theme.colors.primarySoft
      : tone === "warning"
        ? "#FEF3C7"
        : "#F3F4F6";
  const fg =
    tone === "primary"
      ? theme.colors.primaryDeep
      : tone === "warning"
        ? "#92400E"
        : theme.colors.muted;
  return (
    <View
      className="rounded-full px-3 py-1 self-start"
      style={{ backgroundColor: bg }}
    >
      <Text className="text-xs font-bold" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}

/* ---------- Section title row ---------- */
export function SectionTitle({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text
        className="font-bold text-[16px] flex-1"
        numberOfLines={1}
        style={{ color: theme.colors.ink }}
      >
        {title}
      </Text>
      {meta ? (
        <Text className="text-xs ml-2" style={{ color: theme.colors.faint }}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- Empty state: one icon + title + copy language ---------- */
export function EmptyState({
  icon: Icon,
  title,
  copy,
}: {
  icon: LucideIcon;
  title?: string;
  copy: string;
}) {
  return (
    <View className="items-center py-8 px-4">
      <View
        className="h-12 w-12 rounded-2xl items-center justify-center"
        style={{ backgroundColor: theme.colors.primarySoft }}
      >
        <Icon size={22} color={theme.colors.primary} />
      </View>
      {title ? (
        <Text
          className="font-bold text-[14px] mt-3"
          style={{ color: theme.colors.ink }}
        >
          {title}
        </Text>
      ) : null}
      <Text
        className="text-xs mt-1 text-center leading-5"
        style={{ color: theme.colors.muted }}
      >
        {copy}
      </Text>
    </View>
  );
}

/* ---------- Notice banner (info / warning) ---------- */
export function Notice({
  icon: Icon,
  copy,
  tone = "warning",
}: {
  icon: LucideIcon;
  copy: string;
  tone?: "warning" | "info";
}) {
  const isWarning = tone === "warning";
  return (
    <View
      className="flex-row items-start gap-3 px-4 py-4"
      style={{
        borderRadius: theme.radius.card,
        backgroundColor: isWarning
          ? theme.colors.warningBg
          : theme.colors.primarySoft,
        borderWidth: 1,
        borderColor: isWarning
          ? theme.colors.warningBorder
          : theme.colors.cardBorder,
      }}
    >
      <Icon size={18} color={isWarning ? "#B45309" : theme.colors.primary} />
      <Text
        className="text-xs flex-1 leading-5"
        style={{
          color: isWarning ? theme.colors.warningText : theme.colors.body,
        }}
      >
        {copy}
      </Text>
    </View>
  );
}

/* ---------- Modal: the only dialog style in the app ----------
 * Centered card on a dimmed backdrop, themed to match ClinicalCard.
 * Use for confirms, errors, permission prompts, and option pickers —
 * never use bare Alert.alert so dialogs stay on-theme on both platforms. */
export type UiModalAction = {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
};

export function UiModal({
  visible,
  onDismiss,
  title,
  message,
  icon: Icon,
  tone = "primary",
  actions = [],
  children,
  dismissOnBackdrop = true,
}: {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  message?: string;
  icon?: LucideIcon;
  tone?: "primary" | "soft" | "warning" | "danger";
  actions?: UiModalAction[];
  children?: React.ReactNode;
  dismissOnBackdrop?: boolean;
}) {
  const badgeBg =
    tone === "danger"
      ? "#FEF2F2"
      : tone === "warning"
        ? theme.colors.warningBg
        : tone === "soft"
          ? theme.colors.primarySoft
          : theme.colors.primary;
  const badgeFg =
    tone === "danger"
      ? theme.colors.danger
      : tone === "warning"
        ? "#B45309"
        : tone === "soft"
          ? theme.colors.primary
          : "#FFFFFF";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable
        onPress={dismissOnBackdrop ? onDismiss : undefined}
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: "rgba(16, 36, 26, 0.5)" }}
      >
        {/* Inner pressable swallows taps so tapping the card doesn't dismiss */}
        <Pressable onPress={() => {}} className="w-full">
          <View
            className="w-full px-5 py-6 items-center"
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.card,
              borderWidth: 1,
              borderColor: theme.colors.cardBorder,
              ...cardShadow,
            }}
          >
            {Icon ? (
              tone === "primary" ? (
                <LinearGradient
                  colors={[...theme.gradients.icon]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    height: 48,
                    width: 48,
                    borderRadius: 16,
                    marginBottom: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={22} color="#FFFFFF" />
                </LinearGradient>
              ) : (
                <View
                  className="h-12 w-12 rounded-2xl items-center justify-center mb-3"
                  style={{ backgroundColor: badgeBg }}
                >
                  <Icon size={22} color={badgeFg} />
                </View>
              )
            ) : null}
            <Text
              className="font-bold text-[18px] text-center"
              style={{ color: theme.colors.ink }}
            >
              {title}
            </Text>
            {message ? (
              <Text
                className="text-[13px] mt-1.5 text-center leading-5"
                style={{ color: theme.colors.muted }}
              >
                {message}
              </Text>
            ) : null}
            {children ? <View className="w-full mt-4">{children}</View> : null}
            {actions.length > 0 ? (
              <View className="w-full gap-2 mt-5">
                {actions.map((action) => {
                  const kind = action.kind ?? "primary";
                  if (kind === "secondary") {
                    return (
                      <SecondaryButton
                        key={action.label}
                        label={action.loading ? "Please wait…" : action.label}
                        onPress={action.onPress}
                      />
                    );
                  }
                  if (kind === "ghost") {
                    return (
                      <Pressable
                        key={action.label}
                        onPress={action.onPress}
                        disabled={action.disabled || action.loading}
                        className="rounded-full py-3 px-5 items-center justify-center active:opacity-70"
                      >
                        <Text
                          className="font-bold text-[15px]"
                          style={{ color: theme.colors.muted }}
                        >
                          {action.label}
                        </Text>
                      </Pressable>
                    );
                  }
                  const isDanger = kind === "danger";
                  const isDisabled = action.disabled || action.loading;
                  if (isDanger) {
                    return (
                      <Pressable
                        key={action.label}
                        onPress={action.onPress}
                        disabled={isDisabled}
                        accessibilityRole="button"
                        accessibilityLabel={action.label}
                        className="rounded-full py-4 px-5 flex-row items-center justify-center gap-2 active:opacity-80"
                        style={{
                          backgroundColor: isDisabled
                            ? "#D1D5DB"
                            : theme.colors.danger,
                          opacity: isDisabled ? 0.8 : 1,
                        }}
                      >
                        <Text className="font-bold text-white text-[15px]">
                          {action.loading ? "Please wait…" : action.label}
                        </Text>
                      </Pressable>
                    );
                  }
                  return (
                    <Pressable
                      key={action.label}
                      onPress={action.onPress}
                      disabled={isDisabled}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                      className="rounded-full active:opacity-80"
                      style={{
                        borderRadius: theme.radius.pill,
                        overflow: "hidden",
                        opacity: isDisabled ? 0.8 : 1,
                      }}
                    >
                      <LinearGradient
                        colors={
                          isDisabled
                            ? [...theme.gradients.disabled]
                            : [...theme.gradients.dark]
                        }
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        className="py-4 px-5 flex-row items-center justify-center gap-2"
                      >
                        <Text className="font-bold text-white text-[15px]">
                          {action.loading ? "Please wait…" : action.label}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
