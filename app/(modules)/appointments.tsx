import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ToastAndroid,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarCheck, CircleAlert } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import Skeleton from "@/components/Skeleton";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  BackChip,
  ClinicalCard,
  EmptyState,
  Notice,
  Pill,
  ScreenHeader,
  SectionTitle,
  UiModal,
} from "@/components/ui";
import { theme } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  cancelAppointment,
  getMyAppointments,
  resolveAppointmentNames,
  type AppointmentRow,
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

function pillTone(status: AppointmentRow["status"]): "primary" | "neutral" | "warning" {
  if (status === "requested") return "warning";
  if (status === "scheduled") return "primary";
  return "neutral";
}

function statusLabel(a: AppointmentRow): string {
  if (a.status === "scheduled") return "Confirmed — see you then.";
  if (a.status === "requested") return "Waiting for the doctor.";
  return `Status: ${a.status}`;
}

export default function AppointmentsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [doctorNames, setDoctorNames] = useState<Record<string, string>>({});
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancel confirmation (one row at a time).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const appts = await getMyAppointments();
      setRows(appts);
      const names = await resolveAppointmentNames(appts);
      setDoctorNames(names.doctorNames);
      setClinicNames(names.clinicNames);
    } catch (err) {
      console.error("[appointments] load failed:", err);
      setError(err instanceof Error ? err.message : "Couldn't load appointments.");
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (acting) return;
    setActing(true);
    setActionError(null);
    setCancelId(null);
    try {
      await cancelAppointment(id);
      await load();
      ToastAndroid.show("Visit cancelled", ToastAndroid.SHORT);
    } catch (err) {
      console.error("[appointments] cancel failed:", err);
      setActionError(
        err instanceof Error ? err.message : "Couldn't cancel that visit.",
      );
    } finally {
      setActing(false);
    }
  };

// Group rows by status
  const activeRows = rows.filter((a) => a.status === "scheduled" || a.status === "requested");
  const pastRows = rows.filter((a) => a.status !== "scheduled" && a.status !== "requested");

  return (
    <>
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
              <BackChip onPress={() => router.back()} />
              <View className="flex-1">
                <ScreenHeader
                  title="My Appointments"
                  subtitle="Manage your clinic visits"
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
                <EmptyState icon={CalendarCheck} title="Couldn't load" copy={error} />
              </ClinicalCard>
            </FadeItem>
          ) : rows.length === 0 ? (
            <FadeItem index={1}>
              <ClinicalCard className="mt-4">
                <EmptyState
                  icon={CalendarCheck}
                  title="No appointments yet"
                  copy="Find a clinic and book your first visit to get started."
                />
              </ClinicalCard>
            </FadeItem>
          ) : (
            <View className="flex-col gap-6 mt-4">
              {activeRows.length > 0 && (
                <View className="flex-col gap-3">
                  <FadeItem index={1}>
                    <SectionTitle title="Upcoming" meta={`${activeRows.length} active`} />
                  </FadeItem>
                  {activeRows.map((a) => (
                    <FadeItem key={a.id} index={2}>
                      <ClinicalCard className="flex-col gap-3">
                        <View className="flex-row items-center gap-3">
                          <View className="h-10 w-10 rounded-2xl items-center justify-center" style={{ backgroundColor: theme.colors.primarySoft }}>
                            <CalendarCheck size={18} color={theme.colors.primary} />
                          </View>
                          <View className="flex-1">
                            <Text
                              className="font-bold text-[15px]"
                              style={{ color: theme.colors.ink }}
                            >
                              {clinicNames[a.clinic_id] ?? "Clinic"}
                            </Text>
                            <Text
                              className="text-xs mt-0.5"
                              style={{ color: theme.colors.muted }}
                            >
                              {a.doctor_id
                                ? `${doctorNames[a.doctor_id] ?? "Doctor"} · Asked ${fmt(a.created_at)}${
                                    a.preferred_time ? ` · Prefers ${fmt(a.preferred_time)}` : ""
                                  }`
                                : `Asked ${fmt(a.created_at)}${
                                    a.preferred_time ? ` · Prefers ${fmt(a.preferred_time)}` : ""
                                  }`}
                            </Text>
                          </View>
                          <Pill label={a.status} tone={pillTone(a.status)} />
                        </View>

                        <View
                          className="flex-col gap-1 pt-3"
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: theme.colors.divider,
                          }}
                        >
                          {a.preferred_time ? (
                            <Text className="text-xs" style={{ color: theme.colors.body }}>
                              Prefers: {fmt(a.preferred_time)}
                            </Text>
                          ) : null}
                          {a.scheduled_at ? (
                            <Text className="text-xs font-semibold" style={{ color: theme.colors.primary }}>
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
                            <Text className="text-xs" style={{ color: theme.colors.faint }}>
                              No report attached yet
                            </Text>
                          )}
                        </View>

                        <View className="flex-row items-center justify-between pt-1">
                          <Text
                            className="text-xs"
                            style={{ color: theme.colors.faint }}
                          >
                            {statusLabel(a)}
                          </Text>
                          <Pressable
                            onPress={() => {
                              setCancelId(a.id);
                              setCancelOpen(true);
                            }}
                            disabled={acting}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel appointment"
                          >
                            <Text
                              className="text-xs font-bold underline"
                              style={{ color: theme.colors.danger }}
                            >
                              Cancel
                            </Text>
                          </Pressable>
                        </View>
                      </ClinicalCard>
                    </FadeItem>
                  ))}
                </View>
              )}
              
              {pastRows.length > 0 && (
                <View className="flex-col gap-3">
                  <FadeItem index={3}>
                    <SectionTitle title="Past Visits" meta={`${pastRows.length} total`} />
                  </FadeItem>
                  {pastRows.map((a) => (
                    <FadeItem key={a.id} index={4}>
                      <ClinicalCard className="flex-col gap-2">
                        <View className="flex-row items-center justify-between">
                          <Text className="font-bold text-[14px]" style={{ color: theme.colors.ink }}>
                            {clinicNames[a.clinic_id] ?? "Clinic"}
                          </Text>
                          <Pill label={a.status} tone="neutral" />
                        </View>
                        <Text className="text-xs" style={{ color: theme.colors.muted }}>
                          {fmt(a.created_at)}
                        </Text>
                      </ClinicalCard>
                    </FadeItem>
                  ))}
                </View>
              )}
            </View>
          )}
        </KeyboardAwareScroll>


        <UiModal
          visible={cancelOpen}
          onDismiss={() => {
            setCancelOpen(false);
            setCancelId(null);
          }}
          title="Cancel appointment?"
          message="This will cancel your visit request. You can re-book from the clinic page anytime."
          icon={CalendarCheck}
          tone="warning"
          actions={[
            {
              label: "Cancel Visit",
              kind: "danger",
              loading: acting,
              onPress: () => {
                setCancelOpen(false);
                if (cancelId) void handleCancel(cancelId);
              },
            },
            {
              label: "Keep",
              kind: "ghost",
              onPress: () => {
                setCancelOpen(false);
                setCancelId(null);
              },
            },
          ]}
        />
      </SafeAreaView>
    </>
  );
}
