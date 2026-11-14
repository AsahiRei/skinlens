import { Image, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight } from "lucide-react-native";

import { Text } from "@/components/Text";
import Skeleton from "@/components/Skeleton";
import { ClinicalCard } from "@/components/ui";
import { theme } from "@/lib/theme";
import { isRemoteImageUrl } from "@/lib/db/appointments";

function initialOf(name: string): string {
  const clean = name.trim().replace(/^@/, "");
  return (clean.charAt(0) || "?").toUpperCase();
}

export function PatientAvatar({
  name,
  url,
  size = 40,
  ring,
}: {
  name: string;
  url?: string | null;
  size?: number;
  /** Optional border colour (e.g. on the dark hero). */
  ring?: string;
}) {
  const border = ring ? { borderWidth: 2, borderColor: ring } : null;
  if (isRemoteImageUrl(url)) {
    return (
      <Image
        source={{ uri: (url as string).trim() }}
        style={{
          height: size,
          width: size,
          borderRadius: 999,
          backgroundColor: theme.colors.primarySoft,
          ...border,
        }}
        accessibilityLabel={`${name} profile photo`}
      />
    );
  }
  return (
    <LinearGradient
      colors={[...theme.gradients.icon]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        height: size,
        width: size,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        ...border,
      }}
    >
      <Text className="font-bold text-white" style={{ fontSize: Math.round(size * 0.4) }}>
        {initialOf(name)}
      </Text>
    </LinearGradient>
  );
}

/** Pill-shaped segmented control (filters inside a screen). */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <View
      className="flex-row p-1 rounded-full"
      style={{
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.cardBorder,
      }}
      accessibilityRole="tablist"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2 active:opacity-80"
            style={{ backgroundColor: active ? theme.colors.primary : "transparent" }}
          >
            <Text
              className="text-[13px] font-bold"
              style={{ color: active ? "#FFFFFF" : theme.colors.muted }}
              numberOfLines={1}
            >
              {o.label}
            </Text>
            {o.count ? (
              <Text
                className="text-[13px]"
                style={{ color: active ? "rgba(255,255,255,0.75)" : theme.colors.faint }}
              >
                {o.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** One tappable line: avatar, name + detail, trailing meta. */
export function PatientRow({
  name,
  avatarUrl,
  detail,
  meta,
  metaTone = "faint",
  chevron = false,
  onPress,
  divider = false,
}: {
  name: string;
  avatarUrl?: string | null;
  detail: string;
  meta?: string;
  /** Colour of the trailing meta (Home uses amber for waiting requests). */
  metaTone?: "faint" | "warning";
  /** Trailing arrow (Home's style). */
  chevron?: boolean;
  onPress?: () => void;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${name}, ${detail}${meta ? `, ${meta}` : ""}`}
      className="flex-row items-center gap-3 py-3 active:opacity-70"
      style={divider ? { borderTopWidth: 1, borderTopColor: theme.colors.divider } : undefined}
    >
      <PatientAvatar name={name} url={avatarUrl} size={38} />
      <View className="flex-1">
        <Text
          className="text-[14px] font-bold"
          style={{ color: theme.colors.ink }}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text className="text-xs mt-0.5" style={{ color: theme.colors.muted }} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {meta ? (
        <Text
          className={metaTone === "warning" ? "text-[11px] font-bold" : "text-xs"}
          style={{ color: metaTone === "warning" ? theme.colors.warningText : theme.colors.faint }}
        >
          {meta}
        </Text>
      ) : null}
      {chevron && onPress ? <ChevronRight size={16} color={theme.colors.faint} /> : null}
    </Pressable>
  );
}

/** Section header used across the doctor tabs: title, optional count and trailing link. */
export function SectionHeader({
  title,
  count,
  actionLabel,
  onAction,
  pill = false,
}: {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  /** Count in a tinted pill and an arrow on the link (Home's style). */
  pill?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="font-bold text-[16px]" style={{ color: theme.colors.ink }}>
        {title}
      </Text>
      {pill && count !== undefined ? (
        <View
          className="rounded-full px-2 py-0.5"
          style={{ backgroundColor: theme.colors.primarySoft }}
        >
          <Text className="text-[11px] font-bold" style={{ color: theme.colors.primaryDeep }}>
            {count}
          </Text>
        </View>
      ) : count ? (
        <Text className="text-[16px]" style={{ color: theme.colors.faint }}>
          {count}
        </Text>
      ) : null}
      <View className="flex-1" />
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={10}
          accessibilityRole="link"
          accessibilityLabel={actionLabel}
          className="flex-row items-center gap-0.5 active:opacity-60"
        >
          <Text
            className={pill ? "text-xs font-bold" : "text-[13px] font-semibold"}
            style={{ color: theme.colors.primary }}
          >
            {actionLabel}
          </Text>
          {pill ? <ChevronRight size={14} color={theme.colors.primary} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export function CardListSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View className="flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <ClinicalCard key={i} className="flex-col gap-3">
          <View className="flex-row items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <View className="flex-1 gap-1.5">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-44 rounded-md" />
            </View>
            <Skeleton className="h-6 w-20 rounded-full" />
          </View>
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-11 w-full rounded-full" />
        </ClinicalCard>
      ))}
    </View>
  );
}

/** "9:30 AM" */
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "in 25 min", "in 2h 10m", "now", "15 min ago" */
export function fmtCountdown(at: Date, now: number): string {
  const mins = Math.round((at.getTime() - now) / 60000);
  if (mins === 0) return "now";
  const abs = Math.abs(mins);
  const text =
    abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ""}`;
  return mins > 0 ? `in ${text}` : `${text} ago`;
}
