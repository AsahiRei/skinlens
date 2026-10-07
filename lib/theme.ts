/**
 * SkinLens clinical design system — single source of truth.
 * Modern clinical: calm background, deep-ink titles, emerald primary.
 * Keep logic untouched; only visual tokens live here.
 */
export const theme = {
  colors: {
    primary: "#15803D",
    primaryDeep: "#14532D",
    primarySoft: "#EAF6EE",
    primaryTint: "#DCFCE7",
    ink: "#10241A",
    body: "#3F4A44",
    muted: "#6B7280",
    faint: "#9CA3AF",
    background: "#F4F7F5",
    card: "#FFFFFF",
    cardBorder: "#E5EDE8",
    divider: "#EEF2EF",
    warningBg: "#FFFBEB",
    warningBorder: "#FDE68A",
    warningText: "#92400E",
    danger: "#DC2626",
    star: "#F59E0B",
    skeleton: "#E5EDE8",
  },
  radius: {
    card: 20,
    input: 16,
    pill: 999,
  },
  gradients: {
    /* Page canvas: mint white → soft sage (vertical). Full-screen background
     * wash rendered by ScreenGradient behind screen content. */
    screen: ["#F2FBF5", "#DDF2E3"] as const,
    /* Emerald → deep pine (diagonal). Reserved accent, currently unused —
     * all CTA buttons use `dark` so the app speaks one button language. */
    primary: ["#20A451", "#14532D"] as const,
    /* Dark green: pine-tinted → ink (horizontal). Use for CTA buttons
     * (PrimaryButton, modal primary actions, auth submit, onboarding next),
     * large hero banners (Scan Your Skin, Find Nearby) and the tab bar dock. */
    dark: ["#214E36", "#10241A"] as const,
    /* Icon badge: vivid emerald → base primary (diagonal). */
    icon: ["#22B358", "#15803D"] as const,
    disabled: ["#E5E7EB", "#D1D5DB"] as const,
  },
} as const;

export const cardShadow = {
  shadowColor: "#10241A",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
} as const;
