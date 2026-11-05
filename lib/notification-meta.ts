import type { Href } from "expo-router";
import {
  Bell,
  CalendarCheck,
  CalendarX,
  Camera,
  CircleCheck,
  Lightbulb,
  type LucideIcon,
} from "lucide-react-native";

import type { Notification, NotificationType } from "@/types/schema";

/**
 * Single source of truth for how each notification type looks and what it
 * leads to. Both the list and the detail screen read from here, so a new type
 * can never leak its raw key (e.g. "appointment_reply") into the UI again.
 */
export type NotificationMeta = {
  /** Human label for the category, e.g. "Appointment update". */
  label: string;
  icon: LucideIcon;
  /** Icon colour and the soft tile behind it. */
  color: string;
  tint: string;
  cta: { label: string; href: Href };
  /** Short "why am I seeing this" line for the detail screen. */
  context: string;
};

export type NotificationFilter = "all" | "unread" | "appointments" | "skin";

export const NOTIFICATION_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "appointments", label: "Appointments" },
  { key: "skin", label: "Skin care" },
];

const TYPE_LABELS: Record<NotificationType, string> = {
  scan_reminder: "Scan reminder",
  daily_tip: "Skin tip",
  appointment_reply: "Appointment update",
};

/** Never returns a raw snake_case key — unknown types are humanised. */
export function notificationTypeLabel(type: string): string {
  if (type in TYPE_LABELS) return TYPE_LABELS[type as NotificationType];
  const words = type.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Notification";
}

/** Appointment-reply ids are `apptrepl-<appointmentId>-<status>`. */
export function parseAppointmentReplyId(
  id: string,
): { appointmentId: string; status: string } | null {
  const m = /^apptrepl-(.+)-(scheduled|declined|completed)$/.exec(id);
  return m ? { appointmentId: m[1], status: m[2] } : null;
}

export function getNotificationMeta(n: Pick<Notification, "id" | "type">): NotificationMeta {
  const label = notificationTypeLabel(n.type);
  switch (n.type) {
    case "scan_reminder":
      return {
        label,
        icon: Camera,
        color: "#15803D",
        tint: "#EAF6EE",
        cta: { label: "Take a scan", href: "/(tabs)/scan" },
        context:
          "Regular scans under similar lighting make it easier to spot real changes in your skin over time.",
      };
    case "daily_tip":
      return {
        label,
        icon: Lightbulb,
        color: "#B45309",
        tint: "#FEF3C7",
        cta: { label: "View my routine", href: "/(tabs)/routine" },
        context:
          "Daily tips are general guidance. Your routine shows the steps tailored to your latest scan.",
      };
    case "appointment_reply": {
      const status = parseAppointmentReplyId(n.id)?.status;
      const byStatus =
        status === "declined"
          ? { icon: CalendarX, color: "#DC2626", tint: "#FEF2F2" }
          : status === "completed"
            ? { icon: CircleCheck, color: "#0F766E", tint: "#E6F6F4" }
            : { icon: CalendarCheck, color: "#1D4ED8", tint: "#EAF1FE" };
      return {
        label,
        ...byStatus,
        cta: { label: "Open appointments", href: "/(modules)/appointments" },
        context:
          status === "declined"
            ? "The clinic couldn't take this request. You can book another clinic from the map."
            : status === "completed"
              ? "Your doctor closed this visit. Keep scanning weekly so your next visit has fresh data."
              : "Your clinic replied to your visit request. Arrive a few minutes early and bring your SkinLens report.",
      };
    }
    default:
      return {
        label,
        icon: Bell,
        color: "#15803D",
        tint: "#EAF6EE",
        cta: { label: "Go to home", href: "/(tabs)" },
        context: "",
      };
  }
}

export function matchesFilter(n: Notification, f: NotificationFilter): boolean {
  if (f === "unread") return !n.read;
  if (f === "appointments") return n.type === "appointment_reply";
  if (f === "skin") return n.type === "scan_reminder" || n.type === "daily_tip";
  return true;
}

/* ---------- Dates ---------- */

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Just now", "5m", "3h", "Yesterday", "Mon", "Oct 12", "Oct 12, 2025". */
export function relativeTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days === 0) return `${Math.floor(diffMin / 60)}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString(
    "en-US",
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

export function fullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Buckets for section headers, in display order. */
export function groupByDay<T extends { created_at: string }>(
  items: T[],
  now = new Date(),
): { title: string; items: T[] }[] {
  const today = startOfDay(now);
  const buckets: Record<string, T[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };
  for (const it of items) {
    const days = Math.round((today - startOfDay(new Date(it.created_at))) / 86400000);
    const key = days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? "This week" : "Earlier";
    buckets[key].push(it);
  }
  return Object.entries(buckets)
    .filter(([, v]) => v.length > 0)
    .map(([title, v]) => ({ title, items: v }));
}
