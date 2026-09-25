import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowLeft, Plus, ShieldAlert, Trash2, X } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import profileOptions from "@/data/profile-options.json";
import {
  addSensitivityEntry,
  deleteSensitivityEntry,
  getSensitivityHistory,
} from "@/lib/db";
import type { SensitivityEntry } from "@/types/schema";
import { formatter } from "@/utils/formatter";

const TRIGGER_OPTIONS: string[] = profileOptions.triggers;

const SEVERITY_OPTIONS: string[] = profileOptions.severities;

const SEVERITY_STYLES: Record<string, { bg: string; text: string }> =
  profileOptions.severityStyles;

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
            className={`rounded-full px-4 py-2.5 border active:opacity-80 ${
              isSelected
                ? "bg-green-700 border-green-700"
                : "bg-white border-gray-200"
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                isSelected ? "text-white" : "text-gray-700"
              }`}
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
      Alert.alert("Error", "Failed to save the entry. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (entry: SensitivityEntry) => {
    Alert.alert(
      "Delete entry",
      "Remove this sensitivity episode from your history?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSensitivityEntry(entry.id);
              await fetchEntries();
            } catch (err) {
              console.error("Error deleting sensitivity entry:", err);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-50">
      <View className="flex-row items-center gap-3 px-6 pt-4 pb-1">
        <Pressable
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-white border border-gray-100 items-center justify-center active:opacity-70"
        >
          <ArrowLeft size={18} color="#15803D" />
        </Pressable>
        <View className="flex-1">
          <Text className="font-bold text-green-700 text-xl">
            Sensitivity History
          </Text>
          <Text className="text-gray-500 text-sm">
            Track reactions and possible triggers
          </Text>
        </View>
        {!showForm && (
          <Pressable
            onPress={() => setShowForm(true)}
            className="w-9 h-9 rounded-full bg-green-700 items-center justify-center active:opacity-80"
          >
            <Plus size={18} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {showForm && (
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 gap-4 mt-4">
            <View className="flex-row items-center justify-between">
              <Text className="font-bold text-gray-900 text-base">
                Log an Episode
              </Text>
              <Pressable
                onPress={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center active:opacity-70"
              >
                <X size={16} color="#6B7280" />
              </Pressable>
            </View>

            <View className="gap-1.5">
              <Text className="text-sm text-gray-500">Possible Trigger</Text>
              <ChipRow
                options={TRIGGER_OPTIONS}
                value={trigger}
                onChange={setTrigger}
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-sm text-gray-500">Severity</Text>
              <ChipRow
                options={SEVERITY_OPTIONS}
                value={severity}
                onChange={setSeverity}
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-sm text-gray-500">Notes (optional)</Text>
              <View className="bg-white rounded-2xl border border-gray-200 px-4">
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Redness after trying a new moisturizer"
                  placeholderTextColor="#9CA3AF"
                  className="py-3 text-gray-900"
                  multiline
                />
              </View>
            </View>

            <Pressable
              onPress={handleAdd}
              disabled={saving}
              className={`rounded-full py-3.5 active:opacity-80 flex-row items-center justify-center ${
                saving ? "bg-green-700/60" : "bg-green-700"
              }`}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-bold text-white">Save Entry</Text>
              )}
            </Pressable>
          </View>
        )}

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#15803D" size="small" />
          </View>
        ) : entries.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 px-6 items-center gap-2 mt-4">
            <ShieldAlert size={28} color="#15803D" />
            <Text className="font-bold text-gray-800">
              No sensitivity history yet
            </Text>
            <Text className="text-sm text-gray-500 text-center">
              Log a reaction when your skin responds to a product, the sun, or
              other triggers.
            </Text>
          </View>
        ) : (
          <View className="gap-3 mt-4">
            {entries.map((entry) => {
              const style = SEVERITY_STYLES[entry.severity] ??
                SEVERITY_STYLES.mild;
              return (
                <View
                  key={entry.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 gap-2"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View
                        className={`rounded-full px-3 py-1 ${style.bg}`}
                      >
                        <Text
                          className={`text-xs font-bold ${style.text}`}
                        >
                          {formatter(entry.severity)}
                        </Text>
                      </View>
                      <Text className="font-bold text-gray-900">
                        {formatter(entry.trigger_cause)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDelete(entry)}
                      className="w-8 h-8 rounded-full items-center justify-center active:opacity-60"
                    >
                      <Trash2 size={16} color="#DC2626" />
                    </Pressable>
                  </View>
                  {entry.notes ? (
                    <Text className="text-sm text-gray-500 leading-5">
                      {entry.notes}
                    </Text>
                  ) : null}
                  <Text className="text-xs text-gray-400">
                    {formatDate(entry.occurred_at)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
