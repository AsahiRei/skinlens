import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, ChevronDown, ScanFace, TriangleAlert } from "lucide-react-native";

import { Pill } from "@/components/ui";
import { theme } from "@/lib/theme";
import {
  getPatientLatestResult,
  validateAiResult,
  type PatientResultSummary,
} from "@/lib/db/doctor-review";

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function labelFor(status: PatientResultSummary["validation_status"]): string {
  if (status === "confirmed") return "Doctor confirmed";
  if (status === "needs_review") return "Needs follow-up";
  return "Awaiting review";
}

function toneFor(
  status: PatientResultSummary["validation_status"],
): "primary" | "neutral" | "warning" {
  if (status === "confirmed") return "primary";
  if (status === "needs_review") return "warning";
  return "neutral";
}

/**
 * Collapsible review panel inside a doctor's appointment card: shows the
 * patient's newest AI result (score, confidence, model label) and lets an
 * active dermatologist confirm it or flag it for follow-up with notes.
 * Reads and writes go through the SECURITY DEFINER RPCs from migration
 * 0007, so nothing here can alter the scores themselves.
 */
export function DoctorResultValidation({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PatientResultSummary | null>(null);
  const [notes, setNotes] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await getPatientLatestResult(patientId);
      setResult(row);
      setNotes(row?.doctor_notes ?? "");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load the latest scan.",
      );
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  const submit = async (status: "confirmed" | "needs_review") => {
    if (!result || saving) return;
    setSaving(true);
    setError(null);
    try {
      await validateAiResult(result.id, status, notes.trim() || null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save your review.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-col gap-2">
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={
          open ? "Hide AI scan review" : "Review patient's latest AI scan"
        }
        className="flex-row items-center gap-2 rounded-full px-3.5 py-2.5 active:opacity-70"
        style={{
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: theme.colors.cardBorder,
        }}
      >
        <ScanFace size={15} color={theme.colors.primary} />
        <Text
          className="flex-1 text-[13px] font-semibold"
          style={{ color: theme.colors.primary }}
        >
          {open ? "Hide AI scan review" : "Review latest AI scan"}
        </Text>
        <ChevronDown
          size={14}
          color={theme.colors.primary}
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </Pressable>

      {open ? (
        <View
          className="flex-col gap-2.5 rounded-2xl p-3"
          style={{ backgroundColor: theme.colors.background }}
        >
          {loading ? (
            <View className="flex-row items-center gap-2 py-0.5">
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text className="text-xs" style={{ color: theme.colors.muted }}>
                Loading latest scan…
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text className="text-xs leading-5" style={{ color: theme.colors.danger }}>
              {error}
            </Text>
          ) : null}

          {!loading && !error && result === null ? (
            <Text className="text-xs" style={{ color: theme.colors.muted }}>
              This patient has not run an AI scan yet.
            </Text>
          ) : null}

          {result && !loading ? (
            <>
              <View className="flex-row flex-wrap items-center gap-2">
                <Pill label={result.severity} tone="primary" />
                <Pill
                  label={`Score ${Math.round(result.healthscore)}/100`}
                  tone="neutral"
                />
                {result.confidence != null ? (
                  <Pill
                    label={`${(result.confidence * 100).toFixed(0)}% confidence`}
                    tone="neutral"
                  />
                ) : null}
                <Pill
                  label={labelFor(result.validation_status)}
                  tone={toneFor(result.validation_status)}
                />
              </View>

              <Text className="text-xs leading-5" style={{ color: theme.colors.body }}>
                {result.detection_label || result.severity}
                {result.created_at ? ` · scanned ${fmtWhen(result.created_at)}` : ""}
              </Text>

              {result.validation_status !== "pending" && result.validated_at ? (
                <Text className="text-xs leading-5" style={{ color: theme.colors.muted }}>
                  {result.validation_status === "confirmed"
                    ? "Confirmed"
                    : "Flagged for follow-up"}{" "}
                  {fmtWhen(result.validated_at)}.
                  {result.doctor_notes
                    ? ` Notes: ${result.doctor_notes}`
                    : " No notes."}
                </Text>
              ) : null}

              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Notes for the patient chart (optional)"
                placeholderTextColor={theme.colors.muted}
                className="rounded-xl px-3 py-2.5 text-xs"
                style={{
                  minHeight: 64,
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.cardBorder,
                  color: theme.colors.ink,
                  textAlignVertical: "top",
                }}
              />

              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => void submit("confirmed")}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm AI result"
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2.5 active:opacity-80"
                  style={{
                    backgroundColor: theme.colors.primary,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  <Check size={15} color="#FFFFFF" />
                  <Text className="text-[13px] font-bold text-white">
                    {saving ? "Saving…" : "Confirm result"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void submit("needs_review")}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Flag AI result for follow-up"
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-white py-2.5 active:opacity-80"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.cardBorder,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  <TriangleAlert size={15} color={theme.colors.danger} />
                  <Text
                    className="text-[13px] font-bold"
                    style={{ color: theme.colors.danger }}
                  >
                    Follow-up
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
