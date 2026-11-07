import { useCallback, useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  ToastAndroid,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ChevronRight,
  CircleAlert,
  FileText,
  Info,
  Navigation,
  RotateCcw,
} from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  BackChip,
  ClinicalCard,
  EmptyState,
  Notice,
  Pill,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
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
  type AppointmentStatus,
} from "@/lib/db/appointments";
import { getVerifiedClinics, type VerifiedClinic } from "@/lib/db/clinics";
import { openAppointmentReport } from "@/utils/report";

/* ---------- Date helpers ---------- */

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thu, Nov 12" — adds the year only when it isn't the current year. */
function fmtDay(d: Date): string {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Whole calendar days from today (0 = today, 1 = tomorrow, -1 = yesterday). */
function dayDiff(d: Date): number {
  const start = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(d) - start(new Date())) / DAY_MS);
}

function relative(d: Date): string | null {
  const diff = dayDiff(d);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff <= 14) return `in ${diff} days`;
  return null;
}

/* ---------- Status language (patient-facing) ---------- */

const STATUS: Record<
  AppointmentStatus,
  { label: string; tone: "primary" | "neutral" | "warning"; hint: string }
> = {
  requested: {
    label: "Pending",
    tone: "warning",
    hint: "The clinic will confirm a time with you soon.",
  },
  scheduled: {
    label: "Confirmed",
    tone: "primary",
    hint: "Please arrive 10 minutes early.",
  },
  completed: { label: "Completed", tone: "primary", hint: "" },
  cancelled: { label: "Cancelled", tone: "neutral", hint: "" },
  declined: {
    label: "Not accepted",
    tone: "warning",
    hint: "The clinic couldn't take this request. You can book another time.",
  },
};

function statusMeta(s: AppointmentStatus) {
  return STATUS[s] ?? { label: s, tone: "neutral" as const, hint: "" };
}

/** Confirmed visits first (soonest first), then pending requests. */
function sortActive(a: AppointmentRow, b: AppointmentRow): number {
  if (a.status !== b.status) return a.status === "scheduled" ? -1 : 1;
  const ta = parse(a.scheduled_at ?? a.preferred_time)?.getTime() ?? Infinity;
  const tb = parse(b.scheduled_at ?? b.preferred_time)?.getTime() ?? Infinity;
  return ta - tb;
}

/** Most recent first, by visit date when there was one. */
function sortPast(a: AppointmentRow, b: AppointmentRow): number {
  const ta = parse(a.scheduled_at ?? a.created_at)?.getTime() ?? 0;
  const tb = parse(b.scheduled_at ?? b.created_at)?.getTime() ?? 0;
  return tb - ta;
}

/* ---------- Date block: the visual anchor of each card ---------- */

function DateBlock({
  date,
  confirmed,
  small = false,
}: {
  date: Date | null;
  confirmed: boolean;
  small?: boolean;
}) {
  const w = small ? 46 : 58;
  const h = small ? 50 : 64;
  return (
    <View
      className="items-center justify-center rounded-2xl"
      style={{
        width: w,
        height: h,
        backgroundColor: confirmed ? theme.colors.primarySoft : theme.colors.card,
        borderWidth: confirmed ? 0 : 1.5,
        borderStyle: confirmed ? "solid" : "dashed",
        borderColor: theme.colors.cardBorder,
      }}
      accessible={false}
    >
      {date ? (
        <>
          <Text
            className="font-bold uppercase"
            style={{
              fontSize: small ? 10 : 11,
              letterSpacing: 0.6,
              color: confirmed ? theme.colors.primary : theme.colors.muted,
            }}
          >
            {date.toLocaleDateString("en-US", { month: "short" })}
          </Text>
          <Text
            className="font-bold"
            style={{
              fontSize: small ? 18 : 22,
              lineHeight: small ? 22 : 26,
              color: confirmed ? theme.colors.primaryDeep : theme.colors.body,
            }}
          >
            {date.getDate()}
          </Text>
        </>
      ) : (
        <Text className="text-xs font-bold" style={{ color: theme.colors.muted }}>
          TBD
        </Text>
      )}
    </View>
  );
}

/* ---------- Small inline action ---------- */

function InlineAction({
  icon: Icon,
  label,
  onPress,
  disabled,
}: {
  icon: typeof Navigation;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2 active:opacity-70"
      style={{
        borderWidth: 1,
        borderColor: theme.colors.cardBorder,
        backgroundColor: theme.colors.card,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Icon size={14} color={theme.colors.primary} />
      <Text className="text-[13px] font-semibold" style={{ color: theme.colors.primary }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------- Screen ---------- */

export default function AppointmentsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [doctorNames, setDoctorNames] = useState<Record<string, string>>({});
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [clinics, setClinics] = useState<Record<string, VerifiedClinic>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  // Cancel confirmation (one row at a time).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelRow, setCancelRow] = useState<AppointmentRow | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // iOS has no ToastAndroid — short confirmations show as an info notice.
  const [info, setInfo] = useState<string | null>(null);

  const notify = useCallback((msg: string, long = false) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(msg, long ? ToastAndroid.LONG : ToastAndroid.SHORT);
    } else {
      setInfo(msg);
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [appts, verified] = await Promise.all([
        getMyAppointments(),
        getVerifiedClinics(),
      ]);
      setRows(appts);
      setClinics(Object.fromEntries(verified.map((c) => [c.id, c])));
      const names = await resolveAppointmentNames(appts);
      setDoctorNames(names.doctorNames);
      setClinicNames(names.clinicNames);
      hasLoaded.current = true;
    } catch (err) {
      console.error("[appointments] load failed:", err);
      setError(err instanceof Error ? err.message : "Couldn't load appointments.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Skeleton only on the very first load; later focuses refresh silently.
  useFocusEffect(
    useCallback(() => {
      if (!hasLoaded.current) setLoading(true);
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

  const handleRetry = () => {
    setLoading(true);
    void load();
  };

  const handleCancel = async (id: string) => {
    if (acting) return;
    setActing(true);
    setActionError(null);
    setInfo(null);
    try {
      await cancelAppointment(id);
      await load();
      notify("Visit cancelled");
    } catch (err) {
      console.error("[appointments] cancel failed:", err);
      setActionError(
        err instanceof Error ? err.message : "Couldn't cancel that visit.",
      );
    } finally {
      setActing(false);
      setCancelRow(null);
    }
  };

  const openReport = (path: string) => {
    void openAppointmentReport(path).catch((err) => {
      console.warn("[appointments] open report failed:", err);
      notify(
        err instanceof Error ? err.message : "Couldn't open the report PDF.",
        true,
      );
    });
  };

  const openDirections = (c: VerifiedClinic) => {
    const label = encodeURIComponent(c.name);
    const url =
      Platform.OS === "android"
        ? `geo:${c.latitude},${c.longitude}?q=${c.latitude},${c.longitude}(${label})`
        : `https://maps.apple.com/?ll=${c.latitude},${c.longitude}&q=${label}`;
    Linking.openURL(url).catch(() => notify("Couldn't open the map app."));
  };

  const bookAgain = (c: VerifiedClinic) => {
    router.push({
      pathname: "/derma-info/[id]",
      params: {
        id: c.id,
        name: c.name,
        specialty: c.specialty,
        clinic: c.clinic,
        address: c.address,
        distanceKm: "0",
        rating: String(c.rating),
        availableToday: String(c.availableToday),
        phone: c.phone,
        website: c.website,
        hours: c.hours,
        description: c.description,
        isCustom: "1",
      },
    });
  };

  const clinicName = (a: AppointmentRow) =>
    clinicNames[a.clinic_id] ?? clinics[a.clinic_id]?.name ?? "Clinic";

  const activeRows = rows
    .filter((a) => a.status === "scheduled" || a.status === "requested")
    .sort(sortActive);
  const pastRows = rows
    .filter((a) => a.status !== "scheduled" && a.status !== "requested")
    .sort(sortPast);

  const cancelDate = parse(cancelRow?.scheduled_at ?? null);
  const cancelIsConfirmed = cancelRow?.status === "scheduled";

  return (
    <>
      <SafeAreaView
        edges={["top"]}
        className="flex-1"
        style={{ backgroundColor: theme.colors.background }}
      >
        <ScreenGradient />
        <ScrollView
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
          {info ? (
            <View className="mt-3">
              <Notice icon={Info} tone="info" copy={info} />
            </View>
          ) : null}

          {loading ? (
            <View className="flex-col gap-3 mt-4">
              <Skeleton className="h-36 w-full rounded-2xl" />
              <Skeleton className="h-36 w-full rounded-2xl" />
            </View>
          ) : error ? (
            <FadeItem index={1}>
              <ClinicalCard className="mt-4">
                <EmptyState title="Couldn't load your appointments" copy={error} />
                <SecondaryButton label="Try again" onPress={handleRetry} />
              </ClinicalCard>
            </FadeItem>
          ) : rows.length === 0 ? (
            <FadeItem index={1}>
              <ClinicalCard className="mt-4">
                <EmptyState
                  title="No appointments yet"
                  copy="Find a verified clinic near you and request your first visit."
                />
                <PrimaryButton
                  label="Find a clinic"
                  onPress={() => router.push("/(tabs)/derma")}
                />
              </ClinicalCard>
            </FadeItem>
          ) : (
            <View className="flex-col gap-6 mt-4">
              {activeRows.length > 0 ? (
                <View className="flex-col gap-3">
                  <FadeItem index={1}>
                    <SectionTitle
                      title="Upcoming"
                      meta={`${activeRows.length} active`}
                    />
                  </FadeItem>
                  {activeRows.map((a, i) => {
                    const confirmed = a.status === "scheduled";
                    const when = parse(confirmed ? a.scheduled_at : a.preferred_time);
                    const rel = when ? relative(when) : null;
                    const isToday = confirmed && when !== null && dayDiff(when) === 0;
                    const meta = statusMeta(a.status);
                    const clinic = clinics[a.clinic_id];
                    const doctor = a.doctor_id ? doctorNames[a.doctor_id] : null;

                    return (
                      <FadeItem key={a.id} index={2 + i}>
                        <ClinicalCard
                          className="flex-col gap-3"
                          style={
                            isToday
                              ? { borderColor: theme.colors.primary, borderWidth: 1.5 }
                              : undefined
                          }
                        >
                          {isToday ? (
                            <View
                              className="self-start rounded-full px-2.5 py-0.5"
                              style={{ backgroundColor: theme.colors.primary }}
                            >
                              <Text className="text-[11px] font-bold text-white">
                                YOUR VISIT IS TODAY
                              </Text>
                            </View>
                          ) : null}

                          <View className="flex-row items-center gap-3">
                            <DateBlock date={when} confirmed={confirmed} />
                            <View className="flex-1">
                              <Text
                                className="font-bold text-[15px]"
                                style={{ color: theme.colors.ink }}
                                numberOfLines={1}
                              >
                                {clinicName(a)}
                              </Text>
                              {doctor ? (
                                <Text
                                  className="text-xs mt-0.5"
                                  style={{ color: theme.colors.muted }}
                                  numberOfLines={1}
                                >
                                  {doctor}
                                </Text>
                              ) : null}
                              <Text
                                className={`text-[13px] mt-1 ${confirmed ? "font-bold" : ""}`}
                                style={{
                                  color: confirmed
                                    ? theme.colors.primaryDeep
                                    : theme.colors.body,
                                }}
                                numberOfLines={2}
                              >
                                {when
                                  ? `${confirmed ? "" : "Requested for "}${fmtDay(when)} · ${fmtTime(when)}${
                                      rel && !isToday ? ` · ${rel}` : ""
                                    }`
                                  : "Any time that works for the clinic"}
                              </Text>
                            </View>
                            <View className="self-start">
                              <Pill label={meta.label} tone={meta.tone} />
                            </View>
                          </View>

                          {a.report_pdf_path ? (
                            <Pressable
                              onPress={() => openReport(a.report_pdf_path!)}
                              accessibilityRole="button"
                              accessibilityLabel="View attached skin report"
                              className="flex-row items-center gap-2 rounded-xl px-3 py-2.5 active:opacity-70"
                              style={{ backgroundColor: theme.colors.background }}
                            >
                              <FileText size={15} color={theme.colors.primary} />
                              <Text
                                className="text-[13px] flex-1"
                                style={{ color: theme.colors.body }}
                              >
                                Skin report shared with the clinic
                              </Text>
                              <Text
                                className="text-[13px] font-semibold"
                                style={{ color: theme.colors.primary }}
                              >
                                View
                              </Text>
                              <ChevronRight size={15} color={theme.colors.primary} />
                            </Pressable>
                          ) : null}

                          <Text className="text-xs" style={{ color: theme.colors.muted }}>
                            {meta.hint}
                          </Text>

                          <View
                            className="flex-row items-center gap-2 pt-3"
                            style={{
                              borderTopWidth: 1,
                              borderTopColor: theme.colors.divider,
                            }}
                          >
                            {confirmed && clinic ? (
                              <InlineAction
                                icon={Navigation}
                                label="Directions"
                                onPress={() => openDirections(clinic)}
                              />
                            ) : null}
                            <View className="flex-1" />
                            <Pressable
                              onPress={() => {
                                setCancelRow(a);
                                setCancelOpen(true);
                              }}
                              disabled={acting}
                              hitSlop={10}
                              accessibilityRole="button"
                              accessibilityLabel={
                                confirmed ? "Cancel visit" : "Cancel request"
                              }
                              className="py-2 px-1 active:opacity-70"
                            >
                              <Text
                                className="text-[13px] font-bold"
                                style={{ color: theme.colors.danger }}
                              >
                                {confirmed ? "Cancel visit" : "Cancel request"}
                              </Text>
                            </Pressable>
                          </View>
                        </ClinicalCard>
                      </FadeItem>
                    );
                  })}
                </View>
              ) : (
                <FadeItem index={1}>
                  <ClinicalCard>
                    <EmptyState
                      title="No upcoming visits"
                      copy="Need to see a dermatologist again? Book from any verified clinic."
                    />
                    <SecondaryButton
                      label="Find a clinic"
                      onPress={() => router.push("/(tabs)/derma")}
                    />
                  </ClinicalCard>
                </FadeItem>
              )}

              {pastRows.length > 0 ? (
                <View className="flex-col gap-3">
                  <FadeItem index={2 + activeRows.length}>
                    <SectionTitle title="Past visits" meta={`${pastRows.length} total`} />
                  </FadeItem>
                  {pastRows.map((a) => {
                    const meta = statusMeta(a.status);
                    const visit = parse(a.scheduled_at);
                    const asked = parse(a.created_at);
                    const shown = visit ?? asked;
                    const clinic = clinics[a.clinic_id];
                    const completed = a.status === "completed";

                    return (
                      <FadeItem key={a.id} index={3 + activeRows.length}>
                        <ClinicalCard className="flex-col gap-3">
                          <View className="flex-row items-center gap-3">
                            <DateBlock date={shown} confirmed={completed} small />
                            <View className="flex-1">
                              <Text
                                className="font-bold text-[14px]"
                                style={{ color: theme.colors.ink }}
                                numberOfLines={1}
                              >
                                {clinicName(a)}
                              </Text>
                              <Text
                                className="text-xs mt-0.5"
                                style={{ color: theme.colors.muted }}
                                numberOfLines={1}
                              >
                                {shown
                                  ? `${visit ? "Visit" : "Requested"} ${fmtDay(shown)}${
                                      visit ? ` · ${fmtTime(visit)}` : ""
                                    }`
                                  : "—"}
                              </Text>
                            </View>
                            <Pill label={meta.label} tone={meta.tone} />
                          </View>

                          {meta.hint ? (
                            <Text className="text-xs" style={{ color: theme.colors.muted }}>
                              {meta.hint}
                            </Text>
                          ) : null}

                          {a.report_pdf_path || clinic ? (
                            <View className="flex-row flex-wrap items-center gap-2">
                              {a.report_pdf_path ? (
                                <InlineAction
                                  icon={FileText}
                                  label="Skin report"
                                  onPress={() => openReport(a.report_pdf_path!)}
                                />
                              ) : null}
                              {clinic ? (
                                <InlineAction
                                  icon={RotateCcw}
                                  label="Book again"
                                  onPress={() => bookAgain(clinic)}
                                />
                              ) : null}
                            </View>
                          ) : null}
                        </ClinicalCard>
                      </FadeItem>
                    );
                  })}
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>

        <UiModal
          visible={cancelOpen}
          onDismiss={() => {
            setCancelOpen(false);
            setCancelRow(null);
          }}
          title={cancelIsConfirmed ? "Cancel this visit?" : "Cancel this request?"}
          message={
            cancelIsConfirmed
              ? `Your confirmed visit${
                  cancelDate ? ` on ${fmtDay(cancelDate)} at ${fmtTime(cancelDate)}` : ""
                } will be released for other patients. You can book again from the clinic page anytime.`
              : "The clinic will no longer see this request. You can book again from the clinic page anytime."
          }
          actions={[
            {
              label: cancelIsConfirmed ? "Cancel visit" : "Cancel request",
              kind: "danger",
              loading: acting,
              onPress: () => {
                setCancelOpen(false);
                if (cancelRow) void handleCancel(cancelRow.id);
              },
            },
            {
              label: "Keep it",
              kind: "ghost",
              onPress: () => {
                setCancelOpen(false);
                setCancelRow(null);
              },
            },
          ]}
        />
      </SafeAreaView>
    </>
  );
}
