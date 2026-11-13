import { useState } from "react";
import { Pressable } from "react-native";
import { BookOpen } from "lucide-react-native";

import { EvidenceModal } from "@/components/RecommendedProduct";
import { Text } from "@/components/Text";
import { theme } from "@/lib/theme";

/**
 * "Evidence & sources" under a chat reply: opens the verified evidence (level, summary,
 * dermatologist review status, tappable sources) for the ingredients the reply is about.
 */
export function ChatEvidenceLink({ ingredients }: { ingredients: string[] }) {
  const [open, setOpen] = useState(false);
  if (ingredients.length === 0) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Evidence and sources for ${ingredients.join(", ")}`}
        className="flex-row items-center gap-1.5 self-start mt-2 py-1 active:opacity-70"
        hitSlop={8}
      >
        <BookOpen size={13} color={theme.colors.primary} />
        <Text className="text-[12px] font-semibold" style={{ color: theme.colors.primary }}>
          Evidence & sources ({ingredients.join(", ")})
        </Text>
      </Pressable>
      <EvidenceModal ingredients={ingredients} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
