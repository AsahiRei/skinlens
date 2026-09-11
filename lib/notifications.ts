import type { Notification } from "@/types/schema";

const SCAN_REMINDERS = [
  {
    title: "Time for your weekly skin scan",
    message: "Keep track of your skin health by running a quick scan today.",
  },
  {
    title: "Don't forget your skin check",
    message: "Regular scans help detect changes early. Take 30 seconds to scan now.",
  },
  {
    title: "Your skin health update is due",
    message: "Run a scan to see how your skin is responding to your routine.",
  },
  {
    title: "Weekly scan reminder",
    message: "Stay on top of your skincare journey with a quick scan.",
  },
];

const DAILY_TIPS = [
  {
    title: "Morning hydration tip",
    message: "Drink a glass of water before applying skincare to boost absorption.",
  },
  {
    title: "SPF is essential",
    message: "Apply sunscreen even on cloudy days. UV rays penetrate through clouds.",
  },
  {
    title: "Cleanse gently",
    message: "Use lukewarm water and pat your face dry instead of rubbing.",
  },
  {
    title: "Nighttime routine matters",
    message: "Your skin repairs itself at night. Apply a richer moisturizer before bed.",
  },
  {
    title: "Don't skip moisturizer",
    message: "Even oily skin needs hydration. Use a lightweight, non-comedogenic formula.",
  },
  {
    title: "Check your ingredients",
    message: "Avoid mixing retinol with vitamin C. Use them at different times of day.",
  },
  {
    title: "Hands off your face",
    message: "Touching your face can transfer bacteria and cause breakouts.",
  },
  {
    title: "Exfoliate wisely",
    message: "Over-exfoliating damages your skin barrier. Limit to 2-3 times per week.",
  },
];

export function generateScanReminder(): Notification | null {
  const today = new Date().toISOString().split("T")[0];
  const index = today.split("-").reduce((acc, v) => acc + parseInt(v, 10), 0) % SCAN_REMINDERS.length;
  const { title, message } = SCAN_REMINDERS[index];

  return {
    id: `scan-${today}`,
    type: "scan_reminder",
    title,
    message,
    read: false,
    created_at: new Date().toISOString(),
  };
}

export function generateDailyTip(): Notification | null {
  const today = new Date().toISOString().split("T")[0];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const index = dayOfYear % DAILY_TIPS.length;
  const { title, message } = DAILY_TIPS[index];

  return {
    id: `tip-${today}`,
    type: "daily_tip",
    title,
    message,
    read: false,
    created_at: new Date().toISOString(),
  };
}
