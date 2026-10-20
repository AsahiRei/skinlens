import { useEffect, useRef } from "react";
import { Dimensions, ScrollView, Text, View } from "react-native";
import { ScrollText } from "lucide-react-native";

import { UiModal } from "@/components/ui";
import { theme } from "@/lib/theme";

type LegalSection = {
  key: string;
  title: string;
  anchor?: "terms" | "privacy";
  intro?: string;
  blocks?: { label: string; text: string }[];
};

const SECTIONS: LegalSection[] = [
  {
    key: "acceptance",
    title: "1. ACCEPTANCE OF TERMS",
    anchor: "terms",
    intro:
      "By downloading and using this mobile application, you agree to be bound by the Terms and Conditions and to our Privacy Policy. If any circumstances that you don't agree to said terms, you can immediately uninstall this mobile application and cease all use.",
  },
  {
    key: "disclaimer",
    title: "2. MEDICAL & PROFESSIONAL DISCLAIMER",
    blocks: [
      {
        label: "Application Detects Facial Skin Problems:",
        text: "Our AI-powered mobile application for facial skin detection only provides information about user's skin. This mobile application doesn't comprehend any information that is not related to facial skin problems. The application's purpose was for educational and informational only.",
      },
      {
        label: "Consult a Dermatologist:",
        text: "This application don't diagnose a skin problem to the user. Its intended purpose is to detect facial skin conditions and give simple recommendations to the users. It is still better to seek to a medical professional like dermatologist regarding to the facial skin problems.",
      },
    ],
  },
  {
    key: "eligibility",
    title: "3. ACCOUNT ELIGIBILITY & USER GUIDELINES",
    blocks: [
      {
        label: "Age Eligibility:",
        text: "This application is only allowed to be used by users whose ages were 20 and above.",
      },
      {
        label: "Account Security:",
        text: "You are responsible for maintaining the confidentially of your account's credentials and fully responsible to the all activites occured under your account.",
      },
      {
        label: "Accurate Information:",
        text: "You are agree to provide your accurate and true credentials like name, age, birthday, and to the profiling (recent facial skin problems you have).",
      },
    ],
  },
  {
    key: "ai-limitations",
    title: "4. AI LIMITATIONS & INDIVIDUAL RESULTS",
    blocks: [
      {
        label: "Accuracy:",
        text: "While our application is an AI-powered, there as still limitations could affect the accurateness of mobile application. Such as external factors like camera quality, lighting, and image resolution could affect the accuracy of detection of facial skin problems.",
      },
      {
        label: "Individual Results:",
        text: "The results of facial skin detection are not guaranteed. It could vary depends on individual genetics, environmental factors, hormones, or to their daily routine.",
      },
    ],
  },
  {
    key: "data-privacy",
    title: "5. DATA PRIVACY & DATA HANDLING",
    anchor: "privacy",
    blocks: [
      {
        label: "Image Processing:",
        text: "By uploading your photos of facial skin, you are giving the mobile application the consent to process the image for the sole purpose of analyzing facial skin conditions and generating of personalized routine.",
      },
      {
        label: "Data Protection:",
        text: "The mobile application adheres to the Data Privacy Act of 2012 (RA 10173) law of the Philippines. We assure you that the data you provided will be stored safely.",
      },
    ],
  },
];

const SCROLL_MAX = Math.round(Dimensions.get("window").height * 0.5);

export default function LegalModal({
  visible,
  onDismiss,
  initialSection,
}: {
  visible: boolean;
  onDismiss: () => void;
  initialSection?: "terms" | "privacy";
}) {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<"terms" | "privacy", number>>({
    terms: 0,
    privacy: 0,
  });

  useEffect(() => {
    if (!visible) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const anchor = initialSection ?? "terms";
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: offsets.current[anchor],
        animated: false,
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [visible, initialSection]);

  return (
    <UiModal
      visible={visible}
      onDismiss={onDismiss}
      title="Terms & Conditions"
      message="Please read carefully before using SkinLens."
      icon={ScrollText}
      tone="soft"
      actions={[{ label: "Close", kind: "secondary", onPress: onDismiss }]}
    >
      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: SCROLL_MAX }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 4 }}
      >
        {SECTIONS.map((section, index) => (
          <View
            key={section.key}
            onLayout={(e) => {
              if (section.anchor) {
                offsets.current[section.anchor] = e.nativeEvent.layout.y;
              }
            }}
          >
            <Text
              className={`text-[13px] font-bold${index === 0 ? "" : " mt-4"}`}
              style={{ color: theme.colors.ink }}
            >
              {section.title}
            </Text>
            {section.intro ? (
              <Text
                className="text-[13px] leading-5 mt-1.5"
                style={{ color: theme.colors.muted }}
              >
                {section.intro}
              </Text>
            ) : null}
            {section.blocks?.map((block) => (
              <View key={block.label} className="flex-row gap-2 mt-2">
                <Text
                  className="text-[13px] leading-5"
                  style={{ color: theme.colors.muted }}
                >
                  •
                </Text>
                <Text
                  className="flex-1 text-[13px] leading-5"
                  style={{ color: theme.colors.muted }}
                >
                  <Text
                    className="font-semibold"
                    style={{ color: theme.colors.ink }}
                  >
                    {block.label}
                  </Text>{" "}
                  {block.text}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </UiModal>
  );
}
