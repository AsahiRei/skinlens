import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Plus, ShieldAlert, Trash2, X, TriangleAlert } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { ClinicalCard, IconBadge, Pill, PrimaryButton, SectionTitle, UiModal } from "@/components/ui";
import { theme } from "@/lib/theme";
import profileOptions from "@/data/profile-options.json";
import {
  addSensitivityEntry,
  deleteSensitivityEntry,
  getSensitivityHistory,
} from "@/lib/db";
import type { SensitivityEntry } from "@/types/schema";
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
                : { backgroundColor: "#FFFFFF", borderColor: "#E5EDE8" }
            }
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: isSelected ? "#FFFFFF" : "#3F4A44" }}
            >
              {formatter(opt)}
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

  const handleAdd = async () => {
    setSaving(true);
    try {
      await addSensitivityEntry({
        trigger_cause: trigger,
        severity,
        notes,
      });
      setNotes("");
      setShowForm(false);
      await fetchEntries();
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
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <UiModal
        visible={notice !== null}
        onDismiss={() => setNotice(null)}
        title={notice?.title ?? ""}
        message={notice?.message}
        icon={TriangleAlert}
        tone="warning"
        actions={[{ label: "Got it", onPress: () => setNotice(null) }]}
      />
      <UiModal
        visible={pendingDelete !== null}
        onDismiss={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title="Delete entry?"
        message="Remove this sensitivity episode from your history? This can't be undone."
        icon={Trash2}
        tone="danger"
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
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-1 mt-2">
          <Pressable
            onPress={() => router.back()}
            className="w-9 h-9 rounded-full bg-white items-center justify-center active:opacity-70"
            style={{ borderWidth: 1, borderColor: "#E5EDE8" }}
          >
            <ArrowLeft size={18} color="#15803D" />
          </Pressable>
          <View className="flex-1">
            <Text className="font-bold text-[20px]" style={{ color: "#10241A" }}>
              Sensitivity History
            </Text>
            <Text className="text-sm" style={{ color: "#6B7280" }}>
              Track reactions and possible triggers
            </Text>
          </View>
          {!showForm && (
            <Pressable
              onPress={() => setShowForm(true)}
              className="active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel="Log an episode"
            >
              <IconBadge icon={Plus} size="md" tone="primary" />
            </Pressable>
          )}
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
                  style={{ backgroundColor: "#F4F7F5" }}
                >
                  <X size={16} color="#6B7280" />
                </Pressable>
              </View>

              <View className="gap-1.5">
                <Text className="text-sm" style={{ color: "#6B7280" }}>Possible Trigger</Text>
                <ChipRow
                  options={TRIGGER_OPTIONS}
                  value={trigger}
                  onChange={setTrigger}
                />
              </View>

              <View className="gap-1.5">
                <Text className="text-sm" style={{ color: "#6B7280" }}>Severity</Text>
                <ChipRow
                  options={SEVERITY_OPTIONS}
                  value={severity}
                  onChange={setSeverity}
                />
              </View>

              <View className="gap-1.5">
                <Text className="text-sm" style={{ color: "#6B7280" }}>Notes (optional)</Text>
                <View className="bg-white rounded-2xl px-4" style={{ borderWidth: 1, borderColor: "#E5EDE8" }}>
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
            <ActivityIndicator color="#15803D" size="small" />
          </View>
        ) : entries.length === 0 ? (
          <FadeItem index={2}>
            <ClinicalCard className="py-10 px-6 items-center gap-2 mt-4">
              <IconBadge icon={ShieldAlert} size="lg" tone="soft" />
              <Text className="font-bold" style={{ color: theme.colors.ink }}>
                No sensitivity history yet
              </Text>
              <Text className="text-sm text-center" style={{ color: theme.colors.muted }}>
                Log a reaction when your skin responds to a product, the sun, or
                other triggers.
              </Text>
            </ClinicalCard>
          </FadeItem>
        ) : (
          <View className="gap-3 mt-4">
            {entries.map((entry, idx) => {
              return (
                <FadeItem key={entry.id} index={Math.min(2 + idx, 6)}>
                  <ClinicalCard
                    key={entry.id}
                    className="gap-2"
                  >
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
