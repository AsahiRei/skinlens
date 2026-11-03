/**
 * The interactive first-run tour. Each step spotlights a real element on a
 * real screen (targets are registered by <CoachTarget id=...> wrappers in
 * the tab screens) and explains how it works. Steps with `href` navigate
 * there first, so the tour walks the user through every tab in order.
 */
export type CoachStep = {
  /** id of the <CoachTarget> to spotlight */
  target: string;
  /** tab route to open before measuring the target */
  href?: string;
  title: string;
  body: string;
  /** If true, the spotlight allows touches to pass through to the UI. */
  interactive?: boolean;
};

export const TUTORIAL_STEPS: CoachStep[] = [
  {
    target: "home.header",
    // Every step navigates to its own screen first, even the Home ones:
    // the tour can be replayed from any tab (Profile → Replay Tutorial) or
    // over an unfinished first run, and measuring a screen that is not
    // focused fails (react-native-screens detaches inactive tabs), leaving
    // the spotlight unpositioned.
    href: "/(tabs)",
    title: "This is your Home tab",
    body: "Your daily hub. The bell up top shows scan reminders and appointment updates.",
  },
  {
    target: "home.score",
    href: "/(tabs)",
    title: "Your Skin Health Score",
    body: "Updated with every scan. Tap View Progress to see how your skin changes over time.",
  },
  {
    target: "home.routine",
    href: "/(tabs)",
    title: "Today's Routine",
    body: "Morning, afternoon and evening steps picked for your skin. Tap a step's circle as you finish it — progress saves automatically.",
  },
  {
    target: "home.scan",
    href: "/(tabs)",
    title: "Quick Scan",
    body: "Tap this card anytime to scan your skin with the on-device AI. Your photos never leave your phone.",
  },
  {
    target: "scan.actions",
    href: "/(tabs)/scan",
    title: "The Scan Tab",
    body: "Use the camera for a guided face photo, or upload one from your gallery. SkinLens checks the lighting first so results stay accurate.",
  },
  {
    target: "routine.periods",
    href: "/(tabs)/routine",
    title: "The Routine Tab",
    body: "Switch between morning, afternoon and evening plans and check off steps as you do them — your daily progress is tracked here.",
  },
  {
    target: "derma.find",
    href: "/(tabs)/derma",
    title: "The Derma Tab",
    body: "Find skin clinics near you and book appointments. Dermatologists can review and professionally confirm your scan results.",
  },
  {
    target: "profile.card",
    href: "/(tabs)/profile",
    title: "You're All Set",
    body: "Your profile holds your skin details, notifications and settings — and you can replay this tour from this screen anytime.",
  },
];
