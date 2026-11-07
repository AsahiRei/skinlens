import { Dimensions, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";

import { UiModal } from "@/components/ui";
import { theme } from "@/lib/theme";
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from "@/constants/legal";

type LegalType = "terms" | "privacy";

export default function LegalModal({
  visible,
  onDismiss,
  type,
}: {
  visible: boolean;
  onDismiss: () => void;
  type: LegalType;
}) {
  const sections = type === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const title = type === "terms" ? "Terms & Conditions" : "Privacy Policy";

  const SCROLL_MAX = Math.round(Dimensions.get("window").height * 0.5);

  return (
    <UiModal
      visible={visible}
      onDismiss={onDismiss}
      title={title}
      message="Please read carefully before using SkinLens."
      actions={[{ label: "Close", kind: "secondary", onPress: onDismiss }]}
    >
      <ScrollView
        style={{ maxHeight: SCROLL_MAX }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 4 }}
      >
        {sections.map((section, index) => (
          <View key={section.key}>
            <Text
              className={`text-[13px] font-bold${index === 0 ? "" : " mt-4"}`}
              style={{ color: theme.colors.ink }}
            >
              {section.title}
            </Text>
            {section.intro ? (
              <Text className="text-[13px] leading-5 mt-1.5" style={{ color: theme.colors.muted }}>
                {section.intro}
              </Text>
            ) : null}
            {section.blocks?.map((block) => (
              <View key={block.label} className="flex-row gap-2 mt-2">
                <Text className="text-[13px] leading-5" style={{ color: theme.colors.muted }}>
                  •
                </Text>
                <Text
                  className="flex-1 text-[13px] leading-5"
                  style={{ color: theme.colors.muted }}
                >
                  <Text className="font-semibold" style={{ color: theme.colors.ink }}>
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
