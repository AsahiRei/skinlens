/**
 * The interactive first-run tour. Each step spotlights a real element on a real screen (targets are
 * registered by <CoachTarget id=...> wrappers in the tab screens) and explains how it works.
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
    // Every step navigates to its own screen first, even the Home ones: the tour can be replayed
    // from any tab (Profile → Replay Tutorial) or over an unfinished first run, and measuring a
    // screen that is not focused fails (react-native-screens detaches inactive tabs), leaving the
    // spotlight unpositioned.
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

/**
 * Tour for doctor accounts (the /doctor tab group). Same rules as the patient tour: every step
 * carries its own href so it can be replayed from any doctor tab.
 */
export const DOCTOR_TUTORIAL_STEPS: CoachStep[] = [
  {
    target: "doctor.header",
    href: "/doctor",
    title: "Welcome, Doctor",
    body: "This is your Home tab. The bell up top alerts you when a patient books a visit at your clinic.",
  },
  {
    target: "doctor.stats",
    href: "/doctor",
    title: "Your Queue at a Glance",
    body: "New requests, scheduled visits and today's visits. Tap a tile to switch the list below to it.",
  },
  {
    target: "doctor.calendar",
    href: "/doctor",
    title: "Week Calendar",
    body: "White dots mark scheduled visits, amber dots mark days patients prefer. Tap a day to filter the list — tap it again to clear.",
  },
  {
    target: "doctor.queue",
    href: "/doctor",
    title: "Handle Requests",
    body: "Each card shows the patient and their preferred time. Review their scan results, then Schedule visit or Decline. Scheduled visits can be marked Complete or cancelled.",
  },
  {
    target: "doctor.history",
    href: "/doctor/history",
    title: "The History Tab",
    body: "Every past visit lives here. Search by patient name or status, or filter by completed, cancelled and declined.",
  },
  {
    target: "doctor.profile.card",
    href: "/doctor/profile",
    title: "Your Account",
    body: "Your doctor profile, linked hospital and notification settings — and you can replay this tour from this screen anytime.",
  },
];

export type TutorialKind = "patient" | "doctor";

export const TUTORIALS: Record<TutorialKind, CoachStep[]> = {
  patient: TUTORIAL_STEPS,
  doctor: DOCTOR_TUTORIAL_STEPS,
};
