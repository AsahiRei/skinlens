import { useState } from "react";
import { Pressable, ToastAndroid, View } from "react-native";
import { ThumbsDown } from "lucide-react-native";

import { Text } from "@/components/Text";
import { UiModal } from "@/components/ui";
import { reportReaction } from "@/lib/routine-refresh";
import { theme } from "@/lib/theme";

const SEVERITIES = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
] as const;

type Severity = (typeof SEVERITIES)[number]["value"];

/**
 * "This irritated me" on a recommendation. People with the same condition react differently, so
 * one tap records a structured reaction (exact ingredient names, not free text) and rebuilds the
 * routine without those ingredients — the user's own history overrides the general knowledge base.
 */
export function ReportReactionButton({
  ingredients,
  productLabel,
  onReported,
}: {
  ingredients: string[];
  productLabel: string;
  /** Called after the entry is saved and the routine rebuilt (e.g. to reload the list). */
  onReported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<Severity>("mild");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await reportReaction({ ingredients, productLabel, severity });
      setDone(true);
      setOpen(false);
      ToastAndroid.show("Logged — your routine was updated without it.", ToastAndroid.LONG);
      onReported?.();
    } catch (err) {
      console.warn("[ReportReaction] failed:", err);
      ToastAndroid.show("Couldn't save that. Please try again.", ToastAndroid.SHORT);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Text className="text-xs mt-1" style={{ color: theme.colors.muted }}>
        Logged as irritating — removed from future recommendations.
      </Text>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Report that ${productLabel} irritated your skin`}
        className="flex-row items-center gap-1.5 self-start mt-1 py-1"
        hitSlop={8}
      >
        <ThumbsDown size={13} color={theme.colors.muted} />
        <Text className="text-xs font-semibold" style={{ color: theme.colors.muted }}>
          This irritated my skin
        </Text>
      </Pressable>
      <UiModal
        visible={open}
        onDismiss={() => !saving && setOpen(false)}
        title="Log a reaction?"
        message={`We'll add ${ingredients.join(", ") || productLabel} to your sensitivity log and rebuild your routine without ${ingredients.length > 1 ? "them" : "it"}. If you have swelling, blistering or trouble breathing, stop using it and get medical care right away.`}
        actions={[
          { label: "Cancel", kind: "ghost", onPress: () => setOpen(false), disabled: saving },
          { label: "Log reaction", kind: "primary", onPress: confirm, loading: saving },
        ]}
      >
        <View className="gap-2">
          <Text className="text-xs font-semibold" style={{ color: theme.colors.muted }}>
            How bad was it?
          </Text>
          <View className="flex-row gap-2">
            {SEVERITIES.map((s) => {
              const selected = severity === s.value;
              return (
                <Pressable
                  key={s.value}
                  onPress={() => setSeverity(s.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className="rounded-full px-4 py-2 border"
                  style={
                    selected
                      ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                      : { backgroundColor: "#FFFFFF", borderColor: theme.colors.cardBorder }
                  }
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: selected ? "#FFFFFF" : theme.colors.body }}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </UiModal>
    </>
  );
}
