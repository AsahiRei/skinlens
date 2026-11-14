import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { Text } from "@/components/Text";
import { ChevronDown } from "lucide-react-native";

import { Pill } from "@/components/ui";
import { theme } from "@/lib/theme";
import {
  getPatientProfileForReview,
  validatePatientProfile,
  type PatientProfileReview,
  type ProfileValidation,
  type ProfileValidationStatus,
} from "@/lib/db/profile-review";
import { formatter } from "@/utils/formatter";

/** How many sensitivity reactions to list before collapsing to "+N more". */
const SENSITIVITY_PREVIEW = 5;

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function show(value: string | null | undefined): string {
  return value ? formatter(value) : "—";
}

function statusLabel(v: ProfileValidation | null): string {
  if (!v) return "Not reviewed";
  if (!v.is_current) return "Updated since review";
  return v.status === "confirmed" ? "Profile confirmed" : "Needs follow-up";
}

function statusTone(v: ProfileValidation | null): "primary" | "neutral" | "warning" {
  if (!v) return "neutral";
  if (!v.is_current || v.status === "needs_review") return "warning";
  return "primary";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3 py-1">
      <Text className="text-xs" style={{ color: theme.colors.muted }}>
        {label}
      </Text>
      <Text className="text-xs font-semibold flex-1 text-right" style={{ color: theme.colors.ink }}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Collapsible panel inside a doctor's appointment card: shows the patient's self-reported profile
 * (age, gender, skin type, concern, lifestyle, sensitivity history) and lets the dermatologist
 * confirm it or flag it for follow-up with notes. Goes through the RPCs in migration 0012, which
 * only write the verdict — never the patient's own profile tables.
 */
export function DoctorProfileValidation({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<PatientProfileReview | null>(null);
  const [notes, setNotes] = useState("");
  const [showAllReactions, setShowAllReactions] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPatientProfileForReview(patientId);
      setReview(data);
      setNotes(data.validation?.doctor_notes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the patient profile.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  const submit = async (status: ProfileValidationStatus) => {
    if (!review || saving) return;
    setSaving(true);
    setError(null);
    try {
      await validatePatientProfile(patientId, status, notes.trim() || null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your review.");
    } finally {
      setSaving(false);
    }
  };

  const p = review?.profile;
  const v = review?.validation ?? null;
  const reactions = p?.sensitivity ?? [];
  const visibleReactions = showAllReactions ? reactions : reactions.slice(0, SENSITIVITY_PREVIEW);

  return (
    <View className="flex-col gap-2">
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={open ? "Hide patient profile review" : "Review patient profile data"}
        className="flex-row items-center gap-2 rounded-full px-3.5 py-2.5 active:opacity-70"
        style={{
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: theme.colors.cardBorder,
        }}
      >
        <Text className="flex-1 text-[13px] font-semibold" style={{ color: theme.colors.primary }}>
          {open ? "Hide profile review" : "Review patient profile"}
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
                Loading patient profile…
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text className="text-xs leading-5" style={{ color: theme.colors.danger }}>
              {error}
            </Text>
          ) : null}

          {p && !loading ? (
            <>
              <View className="flex-row flex-wrap items-center gap-2">
                <Pill label={statusLabel(v)} tone={statusTone(v)} />
              </View>

              {v ? (
                <Text className="text-xs leading-5" style={{ color: theme.colors.muted }}>
                  {v.status === "confirmed" ? "Confirmed" : "Flagged for follow-up"}
                  {v.validator_name ? ` by ${v.validator_name}` : ""}
                  {v.validated_at ? ` on ${fmtWhen(v.validated_at)}` : ""}.
                  {!v.is_current
                    ? " The patient has changed their profile since — please review again."
                    : ""}
                </Text>
              ) : null}

              <View
                className="rounded-xl px-3 py-2"
                style={{
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.cardBorder,
                }}
              >
                <Text className="text-[11px] font-bold mb-1" style={{ color: theme.colors.faint }}>
                  PERSONAL & SKIN
                </Text>
                <Field label="Date of birth" value={p.age || "—"} />
                <Field label="Gender" value={show(p.gender)} />
                <Field label="Skin type" value={show(p.skin_type)} />
                <Field label="Main concern" value={show(p.main_concerns)} />

                <Text
                  className="text-[11px] font-bold mt-2 mb-1"
                  style={{ color: theme.colors.faint }}
                >
                  LIFESTYLE
                </Text>
                <Field label="Sleep quality" value={show(p.sleep_quality)} />
                <Field label="Water intake" value={show(p.water_intake)} />
                <Field label="Stress level" value={show(p.stress_level)} />

                <Text
                  className="text-[11px] font-bold mt-2 mb-1"
                  style={{ color: theme.colors.faint }}
                >
                  SENSITIVITY HISTORY ({reactions.length})
                </Text>
                {reactions.length === 0 ? (
                  <Text className="text-xs py-1" style={{ color: theme.colors.muted }}>
                    No reactions logged.
                  </Text>
                ) : (
                  visibleReactions.map((r) => (
                    <View key={r.id} className="py-1">
                      <Text className="text-xs font-semibold" style={{ color: theme.colors.ink }}>
                        {r.trigger_cause} · {formatter(r.severity)}
                        <Text className="text-xs font-normal" style={{ color: theme.colors.muted }}>
                          {"  "}
                          {fmtWhen(r.occurred_at)}
                        </Text>
                      </Text>
                      {r.notes ? (
                        <Text className="text-xs" style={{ color: theme.colors.body }}>
                          {r.notes}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
                {reactions.length > SENSITIVITY_PREVIEW ? (
                  <Pressable
                    onPress={() => setShowAllReactions((s) => !s)}
                    accessibilityRole="button"
                    className="py-1 active:opacity-70"
                  >
                    <Text className="text-xs font-semibold" style={{ color: theme.colors.primary }}>
                      {showAllReactions
                        ? "Show less"
                        : `+${reactions.length - SENSITIVITY_PREVIEW} more`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={1000}
                placeholder="Notes for the patient, e.g. corrected skin type (optional)"
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
                  accessibilityLabel="Confirm patient profile"
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2.5 active:opacity-80"
                  style={{
                    backgroundColor: theme.colors.primary,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  <Text className="text-[13px] font-bold text-white">
                    {saving ? "Saving…" : "Confirm profile"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void submit("needs_review")}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Flag patient profile for follow-up"
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-white py-2.5 active:opacity-80"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.cardBorder,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  <Text className="text-[13px] font-bold" style={{ color: theme.colors.danger }}>
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
