import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { Text } from "@/components/Text";
import { useFocusEffect, useRouter } from "expo-router";
import { Plus, Trash2, X } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import {
  BackHeader,
  ClinicalCard,
  IconBadge,
  Pill,
  PrimaryButton,
  SectionTitle,
  UiModal,
} from "@/components/ui";
import { theme } from "@/lib/theme";
import profileOptions from "@/data/profile-options.json";
import { addSensitivityEntry, deleteSensitivityEntry, getSensitivityHistory } from "@/lib/db";
import type { SensitivityEntry } from "@/types/schema";
import type { PhProduct } from "@/types/knowledge";
import { PH_PRODUCTS } from "@/data/ph-products";
import { refreshRoutineFromProfile } from "@/lib/routine-refresh";
import { ingredientsAvoidedBySensitivity } from "@/utils/knowledge";
import { formatter } from "@/utils/formatter";
import { ScreenGradient } from "@/components/ScreenGradient";

const TRIGGER_OPTIONS: string[] = profileOptions.triggers;

const SEVERITY_OPTIONS: string[] = profileOptions.severities;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            className="rounded-full px-4 py-2.5 border active:opacity-80"
            style={
              isSelected
                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                : { backgroundColor: "#FFFFFF", borderColor: theme.colors.cardBorder }
            }
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: isSelected ? "#FFFFFF" : theme.colors.body }}
            >
              {formatter(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ingredients people most often react to — offered as one-tap picks for a product trigger. */
const COMMON_IRRITANTS = [
  "Salicylic Acid",
  "Adapalene",
  "Benzoyl Peroxide",
  "Retinol",
  "Glycolic Acid",
  "Lactic Acid",
  "Azelaic Acid",
  "Tea Tree Oil",
  "Vitamin C",
  "Niacinamide",
  "Sulfur",
  "Urea",
];

/** Notes in a fixed shape ("Product: … Ingredients: … <free text>") that matching can rely on. */
function composeEntryNotes(input: {
  product: PhProduct | null;
  ingredients: string[];
  notes: string;
}): string {
  return [
    input.product ? `Product: ${input.product.brand} ${input.product.name}.` : "",
    input.ingredients.length > 0 ? `Ingredients: ${input.ingredients.join(", ")}.` : "",
    input.notes.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

function MultiChipRow({
  options,
  values,
  onToggle,
}: {
  options: string[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = values.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => onToggle(opt)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            className="rounded-full px-3 py-2 border active:opacity-80"
            style={
              isSelected
                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                : { backgroundColor: "#FFFFFF", borderColor: theme.colors.cardBorder }
            }
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: isSelected ? "#FFFFFF" : theme.colors.body }}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SensitivityScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<SensitivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trigger, setTrigger] = useState("product");
  const [severity, setSeverity] = useState("mild");
  const [notes, setNotes] = useState("");
  // Structured trigger details (product trigger only): exact ingredient names and/or a catalog
  // product, so the app never depends on how the note happens to be worded.
  const [pickedIngredients, setPickedIngredients] = useState<string[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [pickedProduct, setPickedProduct] = useState<PhProduct | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SensitivityEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      setEntries(await getSensitivityHistory());
    } catch (err) {
      console.error("Error fetching sensitivity history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
    }, [fetchEntries]),
  );

  const composedNotes = composeEntryNotes({
    product: trigger === "product" ? pickedProduct : null,
    ingredients: trigger === "product" ? pickedIngredients : [],
    notes,
  });
  // Show what the app understood BEFORE saving, so an unusable entry is caught here, not later.
  const understood = ingredientsAvoidedBySensitivity([
    { trigger_cause: trigger, notes: composedNotes },
  ]);
  const productMatches =
    productQuery.trim().length >= 2 && !pickedProduct
      ? PH_PRODUCTS.filter((p) =>
          `${p.brand} ${p.name}`.toLowerCase().includes(productQuery.trim().toLowerCase()),
        ).slice(0, 5)
      : [];

  const resetForm = () => {
    setNotes("");
    setPickedIngredients([]);
    setProductQuery("");
    setPickedProduct(null);
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      await addSensitivityEntry({
        trigger_cause: trigger,
        severity,
        notes: composedNotes,
      });
      resetForm();
      setShowForm(false);
      await fetchEntries();
      // Recommendations change right away, not at the next scan.
      if (understood.length > 0) {
        try {
          await refreshRoutineFromProfile();
          setNotice({
            title: "Routine updated",
            message: `Your routine no longer recommends ${understood.join(", ")}.`,
          });
        } catch (err) {
          console.warn("[sensitivity] routine refresh failed:", err);
        }
      }
    } catch (err) {
      console.error("Error adding sensitivity entry:", err);
      setNotice({
        title: "Couldn't save",
        message: "Failed to save the entry. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (entry: SensitivityEntry) => {
    setPendingDelete(entry);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteSensitivityEntry(pendingDelete.id);
      setPendingDelete(null);
      await fetchEntries();
      // Removing a trigger may allow an ingredient again — rebuild so the routine matches the log.
      refreshRoutineFromProfile().catch((err) =>
        console.warn("[sensitivity] routine refresh failed:", err),
      );
    } catch (err) {
      console.error("Error deleting sensitivity entry:", err);
      setNotice({
        title: "Couldn't delete",
        message: "Failed to remove the entry. Please try again.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: theme.colors.background }}
    >
      <ScreenGradient />
      <UiModal
        visible={notice !== null}
        onDismiss={() => setNotice(null)}
        title={notice?.title ?? ""}
        message={notice?.message}
        actions={[{ label: "Got it", onPress: () => setNotice(null) }]}
      />
      <UiModal
        visible={pendingDelete !== null}
        onDismiss={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title="Delete entry?"
        message="Remove this sensitivity episode from your history? This can't be undone."
        dismissOnBackdrop={!deleting}
        actions={[
          {
            label: "Delete",
            kind: "danger",
            loading: deleting,
            onPress: () => void confirmDelete(),
          },
          {
            label: "Keep it",
            kind: "secondary",
            onPress: () => setPendingDelete(null),
          },
        ]}
      />
      <FadeItem index={0}>
        <View className="px-5 pt-4 pb-1 mt-2">
          <BackHeader
            title="Sensitivity History"
            subtitle="Track reactions and possible triggers"
            onBack={() => router.back()}
            right={
              !showForm ? (
                <Pressable
                  onPress={() => setShowForm(true)}
                  className="active:opacity-80"
                  accessibilityRole="button"
                  accessibilityLabel="Log an episode"
                >
                  <IconBadge icon={Plus} size="md" tone="primary" />
                </Pressable>
              ) : undefined
            }
          />
        </View>
      </FadeItem>

      <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <FadeItem index={1}>
          {showForm && (
            <ClinicalCard className="gap-4 mt-4">
              <View className="flex-row items-center justify-between">
                <SectionTitle title="Log an Episode" />
                <Pressable
                  onPress={() => setShowForm(false)}
                  className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                  style={{ backgroundColor: theme.colors.background }}
                >
                  <X size={16} color={theme.colors.muted} />
                </Pressable>
              </View>

              <View className="gap-1.5">
                <Text className="text-sm" style={{ color: theme.colors.muted }}>
                  Possible Trigger
                </Text>
                <ChipRow options={TRIGGER_OPTIONS} value={trigger} onChange={setTrigger} />
              </View>

              {trigger === "product" && (
                <>
                  <View className="gap-1.5">
                    <Text className="text-sm" style={{ color: theme.colors.muted }}>
                      Which ingredient do you think caused it? (pick any)
                    </Text>
                    <MultiChipRow
                      options={COMMON_IRRITANTS}
                      values={pickedIngredients}
                      onToggle={(v) =>
                        setPickedIngredients((prev) =>
                          prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                        )
                      }
                    />
                  </View>
                  <View className="gap-1.5">
                    <Text className="text-sm" style={{ color: theme.colors.muted }}>
                      Which product? (optional)
                    </Text>
                    {pickedProduct ? (
                      <View className="flex-row items-center gap-2">
                        <Pill
                          label={`${pickedProduct.brand} ${pickedProduct.name}`}
                          tone="primary"
                        />
                        <Pressable
                          onPress={() => setPickedProduct(null)}
                          accessibilityLabel="Remove product"
                          hitSlop={8}
                        >
                          <X size={16} color={theme.colors.muted} />
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <View
                          className="bg-white rounded-2xl px-4"
                          style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
                        >
                          <TextInput
                            value={productQuery}
                            onChangeText={setProductQuery}
                            placeholder="Search brand or product, e.g. Cetaphil"
                            placeholderTextColor={theme.colors.faint}
                            className="py-3"
                            style={{ color: theme.colors.ink }}
                          />
                        </View>
                        {productMatches.map((p) => (
                          <Pressable
                            key={p.id}
                            onPress={() => {
                              setPickedProduct(p);
                              setProductQuery("");
                            }}
                            className="py-2 active:opacity-70"
                          >
                            <Text
                              className="text-sm font-semibold"
                              style={{ color: theme.colors.ink }}
                            >
                              {p.brand} {p.name}
                            </Text>
                            <Text className="text-xs" style={{ color: theme.colors.muted }}>
                              {p.key_ingredients.join(", ")}
                            </Text>
                          </Pressable>
                        ))}
                      </>
                    )}
                  </View>
                </>
              )}

              <View className="gap-1.5">
                <Text className="text-sm" style={{ color: theme.colors.muted }}>
                  Severity
                </Text>
                <ChipRow options={SEVERITY_OPTIONS} value={severity} onChange={setSeverity} />
              </View>

              <View className="gap-1.5">
                <Text className="text-sm" style={{ color: theme.colors.muted }}>
                  Notes (optional)
                </Text>
                <View
                  className="bg-white rounded-2xl px-4"
                  style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
                >
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="e.g. Redness after trying a new moisturizer"
                    placeholderTextColor={theme.colors.faint}
                    className="py-3"
                    style={{ color: theme.colors.ink }}
                    multiline
                  />
                </View>
              </View>

              {trigger === "product" && (
                <Text
                  className="text-xs leading-4"
                  style={{
                    color:
                      understood.length > 0 ? theme.colors.primaryDeep : theme.colors.warningText,
                  }}
                >
                  {understood.length > 0
                    ? `We'll keep these out of your recommendations: ${understood.join(", ")}.`
                    : "We can't link this to an ingredient yet — pick an ingredient or product above so we can keep it out of your recommendations."}
                </Text>
              )}
              {severity === "severe" && (
                <Text className="text-xs leading-4" style={{ color: theme.colors.danger }}>
                  Severe reactions (swelling, blistering, trouble breathing) need medical care —
                  stop the product and see a doctor.
                </Text>
              )}

              <PrimaryButton
                label={saving ? "Please wait…" : "Save Entry"}
                onPress={handleAdd}
                disabled={saving}
              />
            </ClinicalCard>
          )}
        </FadeItem>

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color={theme.colors.primary} size="small" />
          </View>
        ) : entries.length === 0 ? (
          <FadeItem index={2}>
            <ClinicalCard className="py-10 px-6 items-center gap-2 mt-4">
              <Text className="font-bold" style={{ color: theme.colors.ink }}>
                No sensitivity history yet
              </Text>
              <Text className="text-sm text-center" style={{ color: theme.colors.muted }}>
                Log a reaction when your skin responds to a product, the sun, or other triggers.
              </Text>
            </ClinicalCard>
          </FadeItem>
        ) : (
          <View className="gap-3 mt-4">
            {entries.map((entry, idx) => {
              return (
                <FadeItem key={entry.id} index={Math.min(2 + idx, 6)}>
                  <ClinicalCard key={entry.id} className="gap-2">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <Pill
                          label={formatter(entry.severity)}
                          tone={entry.severity === "severe" ? "warning" : "primary"}
                        />
                        <Text className="font-bold" style={{ color: theme.colors.ink }}>
                          {formatter(entry.trigger_cause)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleDelete(entry)}
                        className="w-8 h-8 rounded-full items-center justify-center active:opacity-60"
                      >
                        <Trash2 size={16} color={theme.colors.danger} />
                      </Pressable>
                    </View>
                    {entry.notes ? (
                      <Text className="text-sm leading-5" style={{ color: theme.colors.muted }}>
                        {entry.notes}
                      </Text>
                    ) : null}
                    <Text className="text-xs" style={{ color: theme.colors.faint }}>
                      {formatDate(entry.occurred_at)}
                    </Text>
                  </ClinicalCard>
                </FadeItem>
              );
            })}
          </View>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
