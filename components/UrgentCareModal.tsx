import { Image } from "react-native";
import { router } from "expo-router";

import { UiModal } from "@/components/ui";

const ALARMED = require("@/assets/images/others/8.png");

/**
 * Tells the user their scan answers point to something that needs an
 * in-person doctor visit. Backdrop taps don't dismiss it: the user has to
 * pick an action, so the warning can't be skipped by accident.
 */
export function UrgentCareModal({
  visible,
  onClose,
  showFindDoctor = true,
}: {
  visible: boolean;
  onClose: () => void;
  /** Off where leaving the screen would lose unsaved work (scan results). */
  showFindDoctor?: boolean;
}) {
  return (
    <UiModal
      visible={visible}
      onDismiss={onClose}
      dismissOnBackdrop={false}
      header={
        <Image
          source={ALARMED}
          style={{ width: 150, height: 150, marginBottom: 8 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      }
      title="You need to see a doctor"
      message="Your answers suggest a severe skin condition. Please visit a dermatologist or the nearest hospital soon. Home skincare alone may not be enough, and early treatment helps prevent scarring and infection."
      actions={
        showFindDoctor
          ? [
              {
                label: "Find a dermatologist",
                onPress: () => {
                  onClose();
                  router.navigate("/(tabs)/derma");
                },
              },
              { label: "I understand", kind: "ghost", onPress: onClose },
            ]
          : [{ label: "I understand", onPress: onClose }]
      }
    />
  );
}
