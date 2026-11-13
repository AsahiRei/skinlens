import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { BookOpen, ExternalLink } from "lucide-react-native";

import { ReportReactionButton } from "@/components/ReportReactionButton";
import { Text } from "@/components/Text";
import { UiModal } from "@/components/ui";
import { EVIDENCE_LABEL, evidenceFor } from "@/data/derm-validation";
import { theme } from "@/lib/theme";
import type { DermIngredientValidation, DermValidationLevel } from "@/types/derm-validation";

/** Dot colour per evidence level: strongest → darkest green, limited → amber. */
const LEVEL_COLOR: Record<DermValidationLevel, string> = {
  guideline: "#14532D",
  regulatory: "#166534",
  association: "#3F7A57",
  clinical: "#6B9E7F",
  emerging: "#D97706",
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  guideline: "Guideline",
  regulatory: "Regulator",
  association: "Association",
  peer_reviewed: "Peer-reviewed",
  other: "Not peer-reviewed",
};

function reviewLine(v: DermIngredientValidation): string {
  const r = v.review;
  if (!r || r.status === "pending") return "Dermatologist review: pending";
  const who = [r.reviewer, r.licenseNo ? `PRC ${r.licenseNo}` : null, r.date]
    .filter(Boolean)
    .join(", ");
  const verdict =
    r.status === "approved"
      ? "Approved"
      : r.status === "approved_with_changes"
        ? "Approved with changes"
        : "Not supported";
  return `Dermatologist review: ${verdict}${who ? ` (${who})` : ""}`;
}

export function EvidenceModal({
  ingredients,
  visible,
  onClose,
}: {
  ingredients: string[];
  visible: boolean;
  onClose: () => void;
}) {
  const records = ingredients.map((name) => ({ name, v: evidenceFor(name) }));
  return (
    <UiModal
      visible={visible}
      onDismiss={onClose}
      title="Evidence & sources"
      actions={[{ label: "Close", kind: "secondary", onPress: onClose }]}
    >
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator>
        <View className="gap-4">
          {records.map(({ name, v }) => (
            <View key={name} className="gap-1.5">
              <View className="flex-row items-center gap-2">
                <View
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: v ? LEVEL_COLOR[v.level] : theme.colors.faint }}
                />
                <Text className="font-bold flex-1" style={{ color: theme.colors.ink }}>
                  {name}
                </Text>
                <Text className="text-xs font-semibold" style={{ color: theme.colors.muted }}>
                  {v ? EVIDENCE_LABEL[v.level] : "No evidence record"}
                </Text>
              </View>
              {v && (
                <>
                  <Text className="text-xs leading-4" style={{ color: theme.colors.body }}>
                    {v.evidence}
                  </Text>
                  <Text className="text-xs italic" style={{ color: theme.colors.muted }}>
                    {reviewLine(v)}
                  </Text>
                  {v.sources.map((s) => (
                    <Pressable
                      key={s.url}
                      onPress={() => void Linking.openURL(s.url).catch(() => {})}
                      accessibilityRole="link"
                      className="flex-row items-start gap-1.5 active:opacity-60"
                    >
                      <ExternalLink
                        size={12}
                        color={theme.colors.primary}
                        style={{ marginTop: 2 }}
                      />
                      <Text
                        className="text-xs flex-1 leading-4"
                        style={{ color: theme.colors.primary }}
                      >
                        [{SOURCE_TYPE_LABEL[s.type] ?? s.type}] {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          ))}
          <Text className="text-[11px] leading-4" style={{ color: theme.colors.faint }}>
            Evidence levels summarise published guidelines, regulators and studies. They describe
            the ingredient in general, not how your skin will react — patch-test new products.
          </Text>
        </View>
      </ScrollView>
    </UiModal>
  );
}

/**
 * Body of a recommended-product card (callers keep their own container): name, ingredient chips
 * marked by evidence strength, the reason, an "Evidence & sources" link and the reaction button.
 */
export function RecommendedProductBody({
  product,
  onReported,
  showEvidenceLink = true,
}: {
  product: { product_type: string; recommended_ingredients: string[]; reason?: string };
  onReported?: () => void;
  showEvidenceLink?: boolean;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  return (
    <View className="gap-1.5">
      <Text className="font-bold text-[15px]" style={{ color: theme.colors.ink }}>
        {product.product_type}
      </Text>
      <View className="flex-row flex-wrap gap-1.5 mt-1">
        {product.recommended_ingredients.map((ingredient) => {
          const v = evidenceFor(ingredient);
          return (
            <View
              key={ingredient}
              className="flex-row items-center gap-1.5 rounded-full px-3 py-1"
              style={{ backgroundColor: theme.colors.primarySoft }}
              accessibilityLabel={`${ingredient}, ${v ? EVIDENCE_LABEL[v.level] : "no evidence record"}`}
            >
              <View
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: v ? LEVEL_COLOR[v.level] : theme.colors.faint }}
              />
              <Text className="text-xs font-semibold" style={{ color: theme.colors.primaryDeep }}>
                {ingredient}
              </Text>
            </View>
          );
        })}
      </View>
      {!!product.reason && (
        <Text className="text-xs mt-1" style={{ color: theme.colors.muted }}>
          {product.reason}
        </Text>
      )}
      <View className="flex-row flex-wrap items-center gap-x-4">
        {showEvidenceLink && (
          <Pressable
            onPress={() => setShowEvidence(true)}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 self-start mt-1 py-1"
            hitSlop={8}
          >
            <BookOpen size={13} color={theme.colors.primary} />
            <Text className="text-xs font-semibold" style={{ color: theme.colors.primary }}>
              Evidence & sources
            </Text>
          </Pressable>
        )}
        <ReportReactionButton
          ingredients={product.recommended_ingredients}
          productLabel={product.product_type}
          onReported={onReported}
        />
      </View>
      <EvidenceModal
        ingredients={product.recommended_ingredients}
        visible={showEvidence}
        onClose={() => setShowEvidence(false)}
      />
    </View>
  );
}
