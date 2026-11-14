import { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Switch, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Building,
  Check,
  Clock,
  Globe,
  Info,
  MapPin,
  Navigation,
  Phone,
  Users,
  type LucideIcon,
} from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { AppointmentSlotPicker } from "@/components/AppointmentSlotPicker";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  BackHeader,
  ClinicalCard,
  Notice,
  Pill,
  PrimaryButton,
  SectionTitle,
  UiModal,
} from "@/components/ui";
import { theme } from "@/lib/theme";
import { ScreenGradient } from "@/components/ScreenGradient";
import { uploadSkinReportForAppointment } from "@/utils/report";
import {
  attachReportToAppointment,
  BOOKED_SLOT_MESSAGE,
  formatPatientDisplayName,
  HELD_SLOT_MESSAGE,
  getDoctorsForClinic,
  getMyAppointments,
  isRemoteImageUrl,
  OWN_OVERLAP_MESSAGE,
  PAST_TIME_MESSAGE,
  PENDING_HERE_MESSAGE,
  requestAppointment,
  type AppointmentRow,
  type DoctorRow,
} from "@/lib/db/appointments";
import { getUserProfile } from "@/lib/db";
import {
  findOwnConflict,
  formatMinutes,
  formatSlotDay,
  formatSlotTime,
  ownBusyTimes,
  parseClinicHours,
} from "@/utils/booking-slots";

/** Why a request can't be sent as picked (shown in one modal). */
type BookingIssue = { title: string; message: string; viewRequests?: boolean };

type PlaceDetails = {
  phone?: string;
  website?: string;
  openingHours?: string;
};

export default function DermatologistDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    name: string;
    specialty: string;
    clinic: string;
    address: string;
    distanceKm: string;
    rating: string;
    availableToday: string;
    phone?: string;
    website?: string;
    hours?: string;
    description?: string;
    isCustom?: string;
    lat?: string;
    lng?: string;
  }>();

  const rating = Number(params.rating ?? 0);
  const distanceKm = Number(params.distanceKm ?? 0);
  const availableToday = params.availableToday === "true";

  // Verified entries (from the Supabase `clinics` table) arrive with their contact info as nav
  // params.
  const isCustomEntry = params.isCustom === "1";
  const customDescription = (typeof params.description === "string" && params.description) || "";

  const details: PlaceDetails = {
    phone: (typeof params.phone === "string" && params.phone) || undefined,
    website: (typeof params.website === "string" && params.website) || undefined,
    openingHours: (typeof params.hours === "string" && params.hours) || undefined,
  };

  const [booking, setBooking] = useState(false);
  const [showBooked, setShowBooked] = useState(false);
  // The picked slot can go stale while the form sits open (the picker only clamps at pick-time).
  const [showPastSlot, setShowPastSlot] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [issue, setIssue] = useState<BookingIssue | null>(null);
  // The patient's own appointments (any clinic): one pending request per clinic, and their own
  // visits block nearby slots. null until loaded (the server enforces the same rules anyway).
  const [myRows, setMyRows] = useState<AppointmentRow[] | null>(null);
  // Bumped to make the slot picker refetch booked times.
  const [slotsRefresh, setSlotsRefresh] = useState(0);
  // Real booking (verified clinics only — needs a Supabase clinic UUID).
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const [bookedDoctorName, setBookedDoctorName] = useState<string | null>(null);
  // The appointment just created + whether its Skin Report is already linked
  // (so the "Request sent" modal only offers to send it when it isn't).
  const [bookedAppointmentId, setBookedAppointmentId] = useState<string | null>(null);
  const [reportAttached, setReportAttached] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  // Explicit opt-in: the Skin Report holds health data, so it is only
  // uploaded to the clinic when the patient switches this on.
  const [shareReport, setShareReport] = useState(false);

  const clinicHours = useMemo(() => parseClinicHours(details.openingHours), [details.openingHours]);
  const pendingHere = useMemo(
    () => (myRows && params.id ? findOwnConflict(myRows, params.id, null) : null),
    [myRows, params.id],
  );
  const ownTimes = useMemo(() => (myRows ? ownBusyTimes(myRows) : []), [myRows]);

  const showIssue = (msg: string): boolean => {
    if (msg === PENDING_HERE_MESSAGE) {
      setIssue({
        title: "Request already pending",
        message:
          "You already have a request waiting at this clinic. Wait for the doctor to confirm it, or cancel it from My Appointments before booking again.",
        viewRequests: true,
      });
    } else if (msg === OWN_OVERLAP_MESSAGE) {
      setPreferredDate(null);
      setIssue({
        title: "You're busy then",
        message:
          "You already have another visit or request within 30 minutes of that time. Please pick a different date & time.",
      });
    } else if (msg === BOOKED_SLOT_MESSAGE || msg === HELD_SLOT_MESSAGE) {
      // Another patient got this slot after the picker loaded — drop it and refetch.
      setPreferredDate(null);
      setSlotsRefresh((n) => n + 1);
      setIssue({
        title: "Slot just got taken",
        message: "Another patient took that time a moment ago. Please pick another open time.",
      });
    } else {
      return false;
    }
    return true;
  };

  const notify = (msg: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      setNotice(msg);
    }
  };

  // Unverified locations: the only action allowed is opening the full map
  // (Apple Maps / Google Maps) at the place's exact coordinates.
  const openFullMap = () => {
    const label = params.name ?? "Clinic location";
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    const hasCoords = !!params.lat && !!params.lng && Number.isFinite(lat) && Number.isFinite(lng);
    // Verified clinics arrive without coordinates — search their address instead.
    const query = [params.name, params.address].filter(Boolean).join(", ");
    if (!hasCoords && !query) {
      notify("No map location for this clinic.");
      return;
    }
    const url = hasCoords
      ? Platform.OS === "android"
        ? `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`
        : `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label)}`
      : Platform.OS === "android"
        ? `geo:0,0?q=${encodeURIComponent(query)}`
        : `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
    Linking.openURL(url).catch(() => {
      notify("Couldn't open the map app on this device.");
    });
  };

  // Upload the Skin Report PDF and link it to the appointment so the clinic's
  // doctors can open it. Throws on failure (upload or link).
  const sendReportToClinic = async (appointmentId: string) => {
    const storagePath = await uploadSkinReportForAppointment(appointmentId);
    await attachReportToAppointment(appointmentId, storagePath);
    setReportAttached(true);
  };

  // "Send Skin Report" from the Request-sent modal: attaches the report to
  // THIS appointment (it used to only open the OS share sheet, which never
  // reached the clinic and failed to open on iOS while the modal closed).
  const handleSendReportFromModal = async () => {
    if (!bookedAppointmentId || sendingReport) return;
    setSendingReport(true);
    setReportError(null);
    try {
      await sendReportToClinic(bookedAppointmentId);
    } catch (err) {
      console.warn("[book-appointment] modal report send failed:", err);
      const detail = err instanceof Error ? err.message : "";
      setReportError(`Couldn't send the Skin Report: ${detail || "please try again."}`);
    } finally {
      setSendingReport(false);
    }
  };

  // Leaving the Request-sent modal always goes to the appointments list —
  // staying on this form let the same request be booked twice.
  const finishBooking = () => {
    if (sendingReport) return;
    setShowBooked(false);
    router.replace("/(modules)/appointments");
  };

  const handleBook = async () => {
    if (!isCustomEntry || !params.id) return;
    if (booking) return;
    // Press-time re-validation: the picker's minimumDate is captured when the screen renders and
    // only clamps at pick-time, so a slot chosen for "later today" can already be in the past by
    // the time the user hits Book (or was picked as an earlier time today on iOS, whose spinner has
    // no time floor). Never send a request for a schedule that has passed.
    if (preferredDate && preferredDate.getTime() <= Date.now()) {
      setShowPastSlot(true);
      return;
    }
    // Same rules the server applies (0018) — catch them here for a clear message.
    const conflict = myRows ? findOwnConflict(myRows, params.id, preferredDate) : null;
    if (conflict) {
      showIssue(conflict.kind === "pending_here" ? PENDING_HERE_MESSAGE : OWN_OVERLAP_MESSAGE);
      return;
    }
    setBooking(true);
    try {
      // 1. Real booking request → appointments (status 'requested'). Requires network (RLS: patient
      // insert own).
      let patientName: string | null = null;
      let patientAvatarUrl: string | null = null;
      try {
        const prof = await getUserProfile();
        if (prof) {
          patientName = formatPatientDisplayName({
            username: prof.username,
            first_name: prof.first_name ?? null,
          });
          if (patientName === "Patient") patientName = null;
          // Only remote (Cloudinary) photos can be shown on the doctor's
          // device — local file:// enrolls stay on this phone.
          if (isRemoteImageUrl(prof.face_image_url)) {
            patientAvatarUrl = (prof.face_image_url as string).trim();
          }
        }
      } catch {
        /* snapshots are best-effort — booking proceeds without them */
      }
      const row = await requestAppointment({
        clinicId: params.id,
        doctorId,
        preferredTime: preferredDate ? preferredDate.toISOString() : null,
        patientName,
        patientAvatarUrl,
      });
      const picked = doctors.find((d) => d.user_id === (doctorId ?? row.doctor_id));
      setBookedDoctorName(picked?.display_name ?? null);
      setBookedAppointmentId(row.id);
      setReportAttached(false);
      setReportError(null);
      // 2. Only when the patient opted in: generate the Skin Report PDF, upload it to the private
      // `reports` bucket (reports/<uid>/<appointment_id>.pdf) and link it to the appointment row so
      // the doctor can open it from their queue.
      let attachError: string | null = null;
      if (shareReport) {
        try {
          await sendReportToClinic(row.id);
        } catch (pdfErr) {
          // Booking already saved — PDF upload is best-effort, but the user must SEE the failure
          // (else the doctor's Report button is missing with no clue why).
          console.warn("[book-appointment] pdf upload failed:", pdfErr);
          attachError = pdfErr instanceof Error ? pdfErr.message : String(pdfErr ?? "");
        }
      }
      // One message (iOS shows a single inline notice, so a second notify
      // would overwrite the attach failure).
      notify(
        attachError !== null
          ? `Request sent, but the Skin Report couldn't be attached: ${attachError || "unknown error"}`
          : "Request sent — the doctor will confirm your exact time.",
      );
      setShowBooked(true);
    } catch (err) {
      console.error("[book-appointment]", err);
      const msg = err instanceof Error ? err.message : "";
      // requestAppointment re-checks the slot at write time — surface that
      // with the same modal instead of a toast (covers a slot that went
      // stale between the press-time check and the write).
      if (msg === PAST_TIME_MESSAGE) {
        setShowPastSlot(true);
        return;
      }
      if (showIssue(msg)) return;
      notify(
        /network|fetch|failed/i.test(msg)
          ? "You're offline — connect to book this clinic."
          : msg || "Couldn't send the request. Please try again.",
      );
    } finally {
      setBooking(false);
    }
  };

  // Verified clinic → load its active doctors for the booking picker.
  // doctors starts as [] so there is nothing to reset when the entry
  // isn't verifiable (no synchronous setState in the effect body).
  useEffect(() => {
    if (!isCustomEntry || !params.id) {
      return;
    }
    let active = true;
    getDoctorsForClinic(params.id)
      .then((rows) => {
        if (active) setDoctors(rows);
      })
      .catch((err) => {
        console.warn("[book-appointment] doctors fetch failed:", err);
        if (active) setDoctors([]);
      });
    return () => {
      active = false;
    };
  }, [isCustomEntry, params.id]);

  // The patient's own appointments, for the one-pending-per-clinic and no-overlap rules.
  useEffect(() => {
    if (!isCustomEntry || !params.id) return;
    let active = true;
    getMyAppointments()
      .then((rows) => {
        if (active) setMyRows(rows);
      })
      .catch((err) => {
        console.warn("[book-appointment] own appointments fetch failed:", err);
      });
    return () => {
      active = false;
    };
  }, [isCustomEntry, params.id]);

  const hasRating = rating > 0;
  const hasDistance = distanceKm > 0;
  const selectedDoctor = doctors.find((d) => d.user_id === doctorId) ?? null;
  const summaryWhen = preferredDate
    ? `${formatSlotDay(preferredDate)} · ${formatSlotTime(preferredDate)}`
    : "Flexible time";
  const summaryWho = selectedDoctor?.display_name ?? "First available doctor";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      className="flex-1"
      style={{ backgroundColor: theme.colors.background }}
    >
      <ScreenGradient />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
      >
        <FadeItem index={0}>
          <View className="mt-2">
            <BackHeader
              title={isCustomEntry ? "Book a visit" : "Clinic details"}
              onBack={() => router.back()}
            />
          </View>
        </FadeItem>

        {/* ── Clinic hero ─────────────────────────────────────────────── */}
        <FadeItem index={1}>
          <ClinicalCard className="mt-5 flex-col gap-4">
            <View>
              <View>
                <Text
                  className="font-bold text-[18px] leading-6"
                  style={{ color: theme.colors.ink }}
                >
                  {params.name}
                </Text>
                {params.specialty ? (
                  <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.muted }}>
                    {params.specialty}
                  </Text>
                ) : null}
                <View className="flex-row flex-wrap gap-1.5 mt-2">
                  {isCustomEntry ? (
                    <Pill label="Verified clinic" />
                  ) : (
                    <Pill label="Unverified" tone="neutral" />
                  )}
                  {availableToday ? <Pill label="Available today" /> : null}
                </View>
              </View>
            </View>

            {hasRating || hasDistance || clinicHours.parsed ? (
              <View
                className="flex-row rounded-2xl py-3"
                style={{ backgroundColor: theme.colors.background }}
              >
                {hasRating ? <Stat value={rating.toFixed(1)} label="Rating" /> : null}
                {hasDistance ? <Stat value={`${distanceKm.toFixed(1)} km`} label="Away" /> : null}
                {clinicHours.parsed ? (
                  <Stat
                    value={formatMinutes(clinicHours.openMin)}
                    label={`to ${formatMinutes(clinicHours.closeMin)}`}
                  />
                ) : null}
              </View>
            ) : null}

            <View className="flex-col gap-2.5">
              {params.clinic && params.clinic !== params.name ? (
                <InfoRow icon={Building} text={params.clinic} />
              ) : null}
              {params.address ? <InfoRow icon={MapPin} text={params.address} /> : null}
              {isCustomEntry && details.openingHours ? (
                <InfoRow icon={Clock} text={details.openingHours} />
              ) : null}
            </View>

            {isCustomEntry ? (
              <View
                className="flex-row gap-2 pt-4"
                style={{ borderTopWidth: 1, borderTopColor: theme.colors.divider }}
              >
                <QuickAction
                  icon={Phone}
                  label="Call"
                  disabled={!details.phone}
                  onPress={() => {
                    if (details.phone) void Linking.openURL(`tel:${details.phone}`);
                  }}
                />
                <QuickAction
                  icon={Globe}
                  label="Website"
                  disabled={!details.website}
                  onPress={() => {
                    if (details.website) void Linking.openURL(details.website);
                  }}
                />
                <QuickAction icon={Navigation} label="Directions" onPress={openFullMap} />
              </View>
            ) : null}
          </ClinicalCard>
        </FadeItem>

        {customDescription ? (
          <FadeItem index={2}>
            <ClinicalCard className="mt-4 flex-col gap-2">
              <SectionTitle title="About" />
              <Text className="text-sm leading-5" style={{ color: theme.colors.body }}>
                {customDescription}
              </Text>
            </ClinicalCard>
          </FadeItem>
        ) : null}

        {notice && Platform.OS !== "android" ? (
          <View className="mt-4">
            <Notice icon={Info} tone="info" copy={notice} />
          </View>
        ) : null}

        {!isCustomEntry ? (
          <FadeItem index={3}>
            <View className="mt-4">
              <Notice
                icon={Info}
                tone="warning"
                copy="This location is not verified for this app. You can only view it on the map — booking is available at verified clinics only."
              />
            </View>
          </FadeItem>
        ) : (
          <>
            {pendingHere ? (
              <Notice
                icon={Info}
                tone="warning"
                copy="You already have a request waiting at this clinic. You can book again once the doctor answers it, or after you cancel it."
              />
            ) : null}
            {/* ── Step 1 · Doctor ────────────────────────────────────── */}
            <FadeItem index={3}>
              <StepHeader step={1} title="Choose a doctor" hint="Optional" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
              >
                <DoctorOption
                  name="First available"
                  sub="Fastest to confirm"
                  selected={doctorId === null}
                  onPress={() => setDoctorId(null)}
                />
                {doctors.map((d) => (
                  <DoctorOption
                    key={d.user_id}
                    name={d.display_name}
                    sub={d.specialty || "Dermatologist"}
                    selected={doctorId === d.user_id}
                    onPress={() => setDoctorId(doctorId === d.user_id ? null : d.user_id)}
                  />
                ))}
              </ScrollView>
              {doctors.length === 0 ? (
                <Text className="text-xs mt-2" style={{ color: theme.colors.faint }}>
                  No doctors listed yet — your request still goes to the clinic.
                </Text>
              ) : null}
            </FadeItem>

            {/* ── Step 2 · Date & time ───────────────────────────────── */}
            <FadeItem index={4}>
              <StepHeader
                step={2}
                title="Pick a date & time"
                hint={preferredDate ? undefined : "Optional"}
                action={
                  preferredDate
                    ? { label: "Clear", onPress: () => setPreferredDate(null) }
                    : undefined
                }
              />
              <ClinicalCard>
                <AppointmentSlotPicker
                  clinicId={params.id}
                  doctorId={doctorId}
                  hoursText={details.openingHours}
                  value={preferredDate}
                  onChange={setPreferredDate}
                  ownTimes={ownTimes}
                  refreshKey={slotsRefresh}
                />
              </ClinicalCard>
            </FadeItem>

            {/* ── Step 3 · Skin report ───────────────────────────────── */}
            <FadeItem index={5}>
              <StepHeader step={3} title="Share your Skin Report" hint="Optional" />
              <ClinicalCard className="flex-row items-start gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-semibold" style={{ color: theme.colors.ink }}>
                    Send my report to this clinic
                  </Text>
                  <Text className="text-xs mt-1 leading-4" style={{ color: theme.colors.muted }}>
                    Includes your name, birth date, skin &amp; lifestyle answers, latest scan photo,
                    scan history and sensitivity log. Only this clinic&apos;s doctors can open it.
                  </Text>
                </View>
                <Switch
                  value={shareReport}
                  onValueChange={setShareReport}
                  trackColor={{ false: theme.colors.cardBorder, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Share my Skin Report with this clinic"
                />
              </ClinicalCard>
            </FadeItem>
          </>
        )}
      </ScrollView>

      {/* ── Sticky footer: booking summary + CTA ───────────────────────── */}
      <View
        className="px-5 pt-3 pb-3"
        style={{
          backgroundColor: theme.colors.card,
          borderTopWidth: 1,
          borderTopColor: theme.colors.cardBorder,
        }}
      >
        {isCustomEntry ? (
          <View className="mb-3">
            <View>
              <Text
                className="text-[14px] font-bold"
                style={{ color: theme.colors.ink }}
                numberOfLines={1}
              >
                {summaryWhen}
              </Text>
              <Text
                className="text-xs mt-0.5"
                style={{ color: theme.colors.muted }}
                numberOfLines={1}
              >
                {summaryWho}
                {preferredDate ? " · doctor confirms the time" : " · clinic will propose a time"}
              </Text>
            </View>
          </View>
        ) : null}
        {isCustomEntry && pendingHere ? (
          <PrimaryButton
            label="View my pending request"
            onPress={() => router.replace("/(modules)/appointments")}
          />
        ) : isCustomEntry ? (
          <PrimaryButton
            label={booking ? "Sending request…" : "Request appointment"}
            onPress={handleBook}
            loading={booking}
          />
        ) : (
          <PrimaryButton label="View on Map" onPress={openFullMap} />
        )}
      </View>

      <UiModal
        visible={showPastSlot}
        onDismiss={() => setShowPastSlot(false)}
        title="Schedule unavailable"
        message="You're not allowed to appoint on that schedule — the time you picked has already passed. Please choose a later date & time."
        actions={[
          {
            label: "Choose a new time",
            kind: "primary" as const,
            onPress: () => setShowPastSlot(false),
          },
        ]}
      />

      <UiModal
        visible={issue !== null}
        onDismiss={() => setIssue(null)}
        title={issue?.title ?? ""}
        message={issue?.message ?? ""}
        actions={
          issue?.viewRequests
            ? [
                {
                  label: "View my appointments",
                  kind: "primary" as const,
                  onPress: () => {
                    setIssue(null);
                    router.replace("/(modules)/appointments");
                  },
                },
                { label: "Close", kind: "ghost" as const, onPress: () => setIssue(null) },
              ]
            : [
                {
                  label: "Choose a new time",
                  kind: "primary" as const,
                  onPress: () => setIssue(null),
                },
              ]
        }
      />

      <UiModal
        visible={showBooked}
        onDismiss={finishBooking}
        dismissOnBackdrop={!sendingReport}
        title="Request sent"
        message={`Your visit request is with ${params.name}${bookedDoctorName ? ` (${bookedDoctorName})` : ""} — the doctor confirms your exact time.${reportAttached ? " Your Skin Report is attached." : ""}${reportError ? `\n\n${reportError}` : ""}`}
        actions={[
          ...(reportAttached
            ? []
            : [
                {
                  label: "Send Skin Report to clinic",
                  kind: "primary" as const,
                  loading: sendingReport,
                  onPress: () => {
                    void handleSendReportFromModal();
                  },
                },
              ]),
          {
            label: "Done",
            kind: "ghost" as const,
            disabled: sendingReport,
            onPress: finishBooking,
          },
        ]}
      />
    </SafeAreaView>
  );
}

/* ---------- Layout pieces ---------- */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-[14px] font-bold" style={{ color: theme.colors.ink }}>
        {value}
      </Text>
      <Text className="text-[11px] mt-0.5" style={{ color: theme.colors.muted }}>
        {label}
      </Text>
    </View>
  );
}

function InfoRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <View className="flex-row items-start gap-2.5">
      <View className="pt-0.5">
        <Icon size={15} color={theme.colors.faint} />
      </View>
      <Text className="text-[13px] flex-1 leading-5" style={{ color: theme.colors.body }}>
        {text}
      </Text>
    </View>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onPress,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={disabled ? `${label} (not available)` : label}
      className="flex-1 items-center gap-1.5 rounded-2xl py-3 active:opacity-70"
      style={{ backgroundColor: theme.colors.primarySoft, opacity: disabled ? 0.45 : 1 }}
    >
      <Icon size={18} color={theme.colors.primary} />
      <Text className="text-xs font-semibold" style={{ color: theme.colors.primaryDeep }}>
        {label}
      </Text>
    </Pressable>
  );
}

function StepHeader({
  step,
  title,
  hint,
  action,
}: {
  step: number;
  title: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-row items-center gap-2.5 mt-7 mb-3">
      <View
        className="h-6 w-6 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.colors.primary }}
      >
        <Text className="text-[12px] font-bold text-white">{step}</Text>
      </View>
      <Text className="text-[16px] font-bold flex-1" style={{ color: theme.colors.ink }}>
        {title}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button">
          <Text className="text-[13px] font-bold" style={{ color: theme.colors.primary }}>
            {action.label}
          </Text>
        </Pressable>
      ) : hint ? (
        <Text className="text-xs" style={{ color: theme.colors.faint }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function initials(name: string): string {
  const parts = name
    .replace(/^(dr\.?|doctor)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

function DoctorOption({
  name,
  sub,
  selected,
  onPress,
}: {
  name: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}) {
  const isAny = name === "First available";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}, ${sub}`}
      className="rounded-2xl px-3.5 py-3.5 active:opacity-80"
      style={{
        width: 148,
        backgroundColor: selected ? theme.colors.primarySoft : theme.colors.card,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? theme.colors.primary : theme.colors.cardBorder,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: selected ? theme.colors.primary : theme.colors.primarySoft }}
        >
          {isAny ? (
            <Users size={18} color={selected ? "#FFFFFF" : theme.colors.primary} />
          ) : (
            <Text
              className="text-[14px] font-bold"
              style={{ color: selected ? "#FFFFFF" : theme.colors.primary }}
            >
              {initials(name) || "D"}
            </Text>
          )}
        </View>
        {selected ? (
          <View
            className="h-5 w-5 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.colors.primary }}
          >
            <Check size={12} color="#FFFFFF" strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Text
        className="text-[13px] font-bold mt-2.5"
        style={{ color: theme.colors.ink }}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Text className="text-[11px] mt-0.5" style={{ color: theme.colors.muted }} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}
