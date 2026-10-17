import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  CalendarCheck,
  CalendarClock,
  CircleAlert,
  LogOut,
  Stethoscope,
  Ticket,
} from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { DateTimeField } from "@/components/DateTimeField";
import LogoutModal from "@/components/LogoutModal";
import Skeleton from "@/components/Skeleton";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  BackChip,
  ClinicalCard,
  EmptyState,
  IconBadge,
  Notice,
  Pill,
  PrimaryButton,
  ScreenHeader,
  SectionTitle,
  UiModal,
} from "@/components/ui";
import { theme } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  cancelAppointment,
  formatPatientSubtitle,
  getMyAppointments,
  getUserRole,
  patientDisplayFor,
  redeemInviteCode,
  resolveAppointmentNames,
  updateAppointment,
  type AppointmentRow,
  type DoctorProfile,
} from "@/lib/db/appointments";
import { openAppointmentReport } from "@/utils/report";

function fmt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toneFor(status: string): "primary" | "neutral" | "warning" {
  if (status === "requested") return "warning";
  if (status === "scheduled") return "primary";
  return "neutral";
}

// Module scope (not render): default slot = ~24h from app load. Used as the
// scheduler fallback until the doctor picks a time in the native picker
// (event handler — never constructed during render, per purity rules).
const SCHEDULER_FALLBACK = new Date(Date.now() + 24 * 60 * 60 * 1000);

export default function AppointmentsScreen() {
  const router = useRouter();
  const [role, setRole] = useState<"patient" | "doctor" | null>(null);
  const [doctor] = useState<DoctorProfile | null>(null);
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [doctorNames, setDoctorNames] = useState<Record<string, string>>({});
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Doctor scheduling state (one row at a time).
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<Date>(SCHEDULER_FALLBACK);
  const [acting, setActing] = useState(false);
  // Cancel/schedule/decline failures (e.g. the slot is already booked)
  // must be visible, not just logged.
  const [actionError, setActionError] = useState<string | null>(null);

  // Retry invite code (register-time redeem may have failed offline).
  const [retryOpen, setRetryOpen] = useState(false);
  const [retryCode, setRetryCode] = useState("");
  const [retryName, setRetryName] = useState("");
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Doctors land here straight from boot (no tabs) — they sign out from
  // this screen instead of the Profile tab patients use.
  const [logoutModal, setLogoutModal] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getUserRole();
      setRole(r);
      if (r === "doctor") {
        // Doctors now live in /doctor (Schedule + Account tabs).
        // Keep this module patient-only; bounce doctors to their home.
        router.replace("/doctor" as never);
        return;
      }
      {
        const appts = await getMyAppointments();
        setRows(appts);
        const names = await resolveAppointmentNames(appts);
        setPatientNames(names.patientNames);
        setDoctorNames(names.doctorNames);
        setClinicNames(names.clinicNames);
      }
    } catch (err) {
      console.error("[appointments] load failed:", err);
      setError(
        err instanceof Error ? err.message : "Couldn't load appointments.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleCancel = async (id: string) => {
    // No busy state here before: a double-tap fired two cancelAppointment
    // calls and two racing load()s.
    if (acting) return;
    setActing(true);
    setActionError(null);
    try {
      await cancelAppointment(id);
      await load();
    } catch (err) {
      console.error("[appointments] cancel failed:", err);
      setActionError(
        err instanceof Error ? err.message : "Couldn't cancel that visit.",
      );
    } finally {
      setActing(false);
    }
  };

  const handleDoctorAction = async (
    id: string,
    status: "scheduled" | "completed" | "cancelled" | "declined",
  ) => {
    if (acting) return;
    setActing(true);
    setActionError(null);
    try {
      await updateAppointment(id, {
        status,
        scheduledAt:
          status === "scheduled" ? scheduledDate.toISOString() : undefined,
        claimAsDoctor: status === "scheduled",
      });
      setSchedulingId(null);
      await load();
    } catch (err) {
      console.error("[appointments] doctor action failed:", err);
      setActionError(
        err instanceof Error
          ? err.message
          : "Couldn't save that change — try again.",
      );
    } finally {
      setActing(false);
    }
  };

  const handleRetryCode = async () => {
    setRetryError(null);
    const code = retryCode.trim().toUpperCase();
    const name = retryName.trim();
    if (!code || !name) {
      setRetryError("Enter your display name and the invite code.");
      return;
    }
    setRetryLoading(true);
    try {
      await redeemInviteCode(code, name);
      setRetryOpen(false);
      setRetryCode("");
      setLoading(true);
      await load();
    } catch (err) {
      setRetryError(
        err instanceof Error ? err.message : "Invalid invite code.",
      );
    } finally {
      setRetryLoading(false);
    }
  };

  const pending = rows.filter((r) => r.status === "requested");

  return (
    <>
    <LogoutModal isVisible={logoutModal} setVisible={setLogoutModal} />
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: theme.colors.background }}
    >
      <ScreenGradient />
      <KeyboardAwareScroll
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        <FadeItem index={0}>
          <View className="flex-row items-center gap-3 mt-2">
            {role === "doctor" ? (
              <Pressable
                onPress={() => setLogoutModal(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Log out"
                className="h-9 w-9 items-center justify-center rounded-full bg-white"
                style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
              >
                <LogOut size={18} color={theme.colors.primary} />
              </Pressable>
            ) : (
              <BackChip onPress={() => router.back()} />
            )}
            <View className="flex-1">
              <ScreenHeader
                title={
                  role === "doctor" ? "Clinic Requests" : "My Appointments"
                }
                subtitle={
                  role === "doctor"
                    ? doctor
                      ? `${doctor.clinicName} A→ ${pending.length} waiting`
                      : "Doctor queue"
                    : "Requests you sent from clinic pages"
                }
              />
            </View>
          </View>
        </FadeItem>

        {actionError ? (
          <View className="mt-3">
            <Notice icon={CircleAlert} copy={actionError} />
          </View>
        ) : null}

        {loading ? (
          <View className="flex-col gap-3 mt-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </View>
        ) : error ? (
          <FadeItem index={1}>
            <ClinicalCard className="mt-4">
              <EmptyState
                icon={CalendarClock}
                title="Couldn't load"
                copy={error}
              />
            </ClinicalCard>
          </FadeItem>
        ) : role === "doctor" && !doctor ? (
          // Signed in, role=patient but no doctors row, or redeem never ran.
          <FadeItem index={1}>
            <ClinicalCard className="mt-4 flex-col gap-3">
              <View className="flex-row items-center gap-3">
                <IconBadge icon={Ticket} size="lg" tone="soft" />
                <View className="flex-1">
                  <Text
                    className="font-bold text-[15px]"
                    style={{ color: theme.colors.ink }}
                  >
                    Link your hospital
                  </Text>
                  <Text
                    className="text-xs mt-0.5"
                    style={{ color: theme.colors.muted }}
                  >
                    Enter the invite code from your hospital admin.
                  </Text>
                </View>
              </View>
              {retryError ? (
                <Text className="text-xs" style={{ color: theme.colors.danger }}>
                  {retryError}
                </Text>
              ) : null}
              <TextInput
                value={retryName}
                onChangeText={setRetryName}
                placeholder="Display name (Dr. Jane Cruz)"
                placeholderTextColor={theme.colors.faint}
                className="bg-white rounded-2xl px-4 py-3"
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.cardBorder,
                  color: theme.colors.ink,
                }}
              />
              <TextInput
                value={retryCode}
                onChangeText={(t) => setRetryCode(t.toUpperCase())}
                placeholder="SKN-XXXXXX"
                placeholderTextColor={theme.colors.faint}
                autoCapitalize="characters"
                className="bg-white rounded-2xl px-4 py-3"
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.cardBorder,
                  color: theme.colors.ink,
                }}
              />
              <PrimaryButton
                label="Link Hospital"
                onPress={() => void handleRetryCode()}
                loading={retryLoading}
              />
            </ClinicalCard>
          </FadeItem>
        ) : rows.length === 0 ? (
          <FadeItem index={1}>
            <ClinicalCard className="mt-4">
              <EmptyState
                icon={CalendarCheck}
                title={role === "doctor" ? "No requests" : "No appointments"}
                copy={
                  role === "doctor"
                    ? "Patient requests for your clinic will appear here."
                    : "Book a visit from any verified clinic page."
                }
              />
            </ClinicalCard>
          </FadeItem>
        ) : (
          <View className="flex-col gap-3 mt-4">
            {role === "doctor" ? (
              <FadeItem index={1}>
                <ClinicalCard className="flex-row items-center gap-3">
                  <IconBadge icon={Stethoscope} size="lg" tone="soft" />
                  <View className="flex-1">
                    <Text
                      className="font-bold text-[15px]"
                      style={{ color: theme.colors.ink }}
                    >
                      {doctor?.displayName}
                    </Text>
                    <Text
                      className="text-xs mt-0.5"
                      style={{ color: theme.colors.muted }}
                    >
                      {doctor?.specialty} · {doctor?.clinicName}
                    </Text>
                  </View>
                  <Pressable onPress={() => setRetryOpen(true)} hitSlop={8}>
                    <Text
                      className="text-xs font-bold underline"
                      style={{ color: theme.colors.primary }}
                    >
                      Re-link
                    </Text>
                  </Pressable>
                </ClinicalCard>
              </FadeItem>
            ) : (
              <FadeItem index={1}>
                <View className="flex-row items-center justify-between">
                  <SectionTitle
                    title="Requests"
                    meta={`${rows.length} total`}
                  />
                </View>
              </FadeItem>
            )}

            {rows.map((a, idx) => {
              const isScheduling = schedulingId === a.id;
              return (
                <FadeItem key={a.id} index={Math.min(2 + idx, 8)}>
                  <ClinicalCard className="flex-col gap-3">
                    <View className="flex-row items-center gap-3">
                      <IconBadge
                        icon={
                          role === "doctor" ? CalendarClock : CalendarCheck
                        }
                        size="lg"
                        tone="soft"
                      />
                      <View className="flex-1">
                        <Text
                          className="font-bold text-[15px]"
                          style={{ color: theme.colors.ink }}
                        >
                          {role === "doctor"
                            ? patientDisplayFor(a, patientNames)
                            : (clinicNames[a.clinic_id] ?? "Clinic")}
                        </Text>
                        <Text
                          className="text-xs mt-0.5"
                          style={{ color: theme.colors.muted }}
                        >
                          {role === "doctor"
                            ? `${formatPatientSubtitle(patientDisplayFor(a, patientNames))} · Asked ${fmt(a.created_at)}${a.preferred_time ? ` · Prefers ${fmt(a.preferred_time)}` : ""}`
                            : `${a.doctor_id ? (doctorNames[a.doctor_id] ?? "Doctor") + " · " : ""}Asked ${fmt(a.created_at)}`
                          }
                        </Text>
                      </View>
                      <Pill label={a.status} tone={toneFor(a.status)} />
                    </View>

                    <View
                      className="flex-col gap-1 pt-3"
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: theme.colors.divider,
                      }}
                    >
                      {a.preferred_time ? (
                        <Text
                          className="text-xs"
                          style={{ color: theme.colors.body }}
                        >
                          Prefers: {fmt(a.preferred_time)}
                        </Text>
                      ) : null}
                      {a.scheduled_at ? (
                        <Text
                          className="text-xs font-semibold"
                          style={{ color: theme.colors.primary }}
                        >
                          Visit: {fmt(a.scheduled_at)}
                        </Text>
                      ) : null}
                      {a.report_pdf_path ? (
                        <Pressable
                          onPress={() =>
                            void openAppointmentReport(a.report_pdf_path!).catch(
                              (err) => {
                                console.warn(
                                  "[appointments] open report failed:",
                                  err,
                                );
                                ToastAndroid.show(
                                  err instanceof Error
                                    ? err.message
                                    : "Couldn't open the report PDF.",
                                  ToastAndroid.LONG,
                                );
                              },
                            )
                          }
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Open report PDF"
                        >
                          <Text
                            className="text-xs font-semibold underline"
                            style={{ color: theme.colors.primary }}
                          >
                            Open report PDF
                          </Text>
                        </Pressable>
                      ) : (
                        <Text
                          className="text-xs"
                          style={{ color: theme.colors.faint }}
                        >
                          No report attached yet
                        </Text>
                      )}
                    </View>

                    {role === "patient" ? (
                      <View className="flex-row items-center justify-between pt-1">
                        <Text
                          className="text-xs"
                          style={{ color: theme.colors.faint }}
                        >
                          {a.status === "scheduled"
                            ? "Confirmed — see you then."
                            : a.status === "requested"
                              ? "Waiting for the doctor."
                              : `Status: ${a.status}`}
                        </Text>
                        {a.status === "requested" ||
                        a.status === "scheduled" ? (
                          <Pressable
                            onPress={() => void handleCancel(a.id)}
                            disabled={acting}
                            hitSlop={8}
                            style={{ opacity: acting ? 0.5 : 1 }}
                          >
                            <Text
                              className="text-xs font-bold underline"
                              style={{ color: theme.colors.danger }}
                            >
                              Cancel
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : (
                      <View className="flex-col gap-2 pt-1">
                        {a.status === "requested" ? (
                          <>
                            <Pressable
                              onPress={() => {
                                setSchedulingId(isScheduling ? null : a.id);
                              }}
                              className="rounded-full py-3 px-5 items-center justify-center active:opacity-80 bg-white"
                              style={{
                                borderWidth: 1.5,
                                borderColor: theme.colors.primary,
                              }}
                            >
                              <Text
                                className="font-bold text-[14px]"
                                style={{ color: theme.colors.primary }}
                              >
                                {isScheduling ? "Hide scheduler" : "Schedule visit"}
                              </Text>
                            </Pressable>
                            {isScheduling ? (
                              <View className="flex-col gap-2">
                                <DateTimeField
                                  value={scheduledDate}
                                  onChange={setScheduledDate}
                                  placeholder="Pick visit date & time"
                                  minimumDate={new Date()}
                                  fallbackDate={SCHEDULER_FALLBACK}
                                />
                                <PrimaryButton
                                  label="Confirm Schedule"
                                  onPress={() =>
                                    void handleDoctorAction(a.id, "scheduled")
                                  }
                                  loading={acting}
                                />
                              </View>
                            ) : null}
                            <View className="flex-row gap-2">
                              <Pressable
                                onPress={() =>
                                  void handleDoctorAction(a.id, "declined")
                                }
                                disabled={acting}
                                className="flex-1 rounded-full py-3 items-center active:opacity-70"
                                style={{
                                  backgroundColor: theme.colors.danger,
                                  opacity: acting ? 0.6 : 1,
                                }}
                              >
                                <Text className="font-bold text-white text-[14px]">
                                  Decline
                                </Text>
                              </Pressable>
                            </View>
                          </>
                        ) : a.status === "scheduled" ? (
                          <View className="flex-row gap-2">
                            <Pressable
                              onPress={() =>
                                void handleDoctorAction(a.id, "completed")
                              }
                              disabled={acting}
                              className="flex-1 rounded-full py-3 items-center active:opacity-80"
                              style={{
                                backgroundColor: theme.colors.primary,
                                opacity: acting ? 0.6 : 1,
                              }}
                            >
                              <Text className="font-bold text-white text-[14px]">
                                Complete
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() =>
                                void handleDoctorAction(a.id, "cancelled")
                              }
                              disabled={acting}
                              className="flex-1 rounded-full py-3 items-center active:opacity-70 bg-white"
                              style={{
                                borderWidth: 1,
                                borderColor: theme.colors.cardBorder,
                                opacity: acting ? 0.6 : 1,
                              }}
                            >
                              <Text
                                className="font-bold text-[14px]"
                                style={{ color: theme.colors.danger }}
                              >
                                Cancel
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    )}
                  </ClinicalCard>
                </FadeItem>
              );
            })}
          </View>
        )}
      </KeyboardAwareScroll>

      <UiModal
        visible={retryOpen}
        onDismiss={() => {
          setRetryOpen(false);
          setRetryError(null);
        }}
        title="Link a different hospital"
        message="Each doctor account belongs to one hospital. Enter a new invite code to move it."
        icon={Ticket}
        tone="soft"
        actions={[
          {
            label: "Link Hospital",
            loading: retryLoading,
            onPress: () => void handleRetryCode(),
          },
          {
            label: "Cancel",
            kind: "ghost",
            onPress: () => {
              setRetryOpen(false);
              setRetryError(null);
            },
          },
        ]}
      >
        {retryError ? (
          <Text
            className="text-xs mb-2"
            style={{ color: theme.colors.danger }}
          >
            {retryError}
          </Text>
        ) : null}
        <View className="flex-col gap-2">
          <TextInput
            value={retryCode}
            onChangeText={(t) => setRetryCode(t.toUpperCase())}
            placeholder="SKN-XXXXXX"
            placeholderTextColor={theme.colors.faint}
            autoCapitalize="characters"
            className="bg-white rounded-2xl px-4 py-3"
            style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, color: theme.colors.ink }}
          />
        </View>
      </UiModal>
    </SafeAreaView>
    </>
  );
}
