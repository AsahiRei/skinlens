import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Switch, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Building, MapPin, Navigation, Star, Phone, Globe, Clock, Info } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { DateTimeField } from "@/components/DateTimeField";
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
  getDoctorsForClinic,
  getTakenSlots,
  isRemoteImageUrl,
  overlapsTakenSlot,
  PAST_TIME_MESSAGE,
  requestAppointment,
  type DoctorRow,
} from "@/lib/db/appointments";
import { getUserProfile } from "@/lib/db";

type PlaceDetails = {
  phone?: string;
  website?: string;
  openingHours?: string;
};

// Module scope (not render): preferred-slot fallback ≈24h from app load.
const PREFERRED_FALLBACK = new Date(Date.now() + 24 * 60 * 60 * 1000);

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
  // Real booking (verified clinics only — needs a Supabase clinic UUID).
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  // Confirmed visits on the picked day that this request can't use (times only).
  // Tagged with the lookup it answers, so a stale list for another day/doctor is simply ignored.
  const [takenFor, setTakenFor] = useState<{ key: string; slots: Date[] } | null>(null);
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
    if (!params.lat || !params.lng || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      notify("No map coordinates for this location.");
      return;
    }
    const url =
      Platform.OS === "android"
        ? `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`
        : `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label)}`;
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
    if (slotTaken) {
      notify(BOOKED_SLOT_MESSAGE);
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
      notify(
        /network|fetch|failed/i.test(msg)
          ? "You're offline — connect to book this clinic."
          : msg || "Couldn't send the request. Please try again.",
      );
    } finally {
      setBooking(false);
    }
  };

  // Booked times on the picked day, for the chosen doctor (or every doctor when "any").
  const preferredDay = preferredDate ? preferredDate.toDateString() : null;
  const takenKey =
    isCustomEntry && params.id && preferredDay
      ? `${params.id}|${doctorId ?? ""}|${preferredDay}`
      : null;
  useEffect(() => {
    if (!takenKey || !params.id || !preferredDay) return;
    let active = true;
    const start = new Date(preferredDay);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    getTakenSlots(params.id, doctorId, start, end)
      .then((slots) => {
        if (active) setTakenFor({ key: takenKey, slots });
      })
      .catch(() => {
        // The server still blocks a taken slot on save.
        if (active) setTakenFor({ key: takenKey, slots: [] });
      });
    return () => {
      active = false;
    };
  }, [takenKey, params.id, doctorId, preferredDay]);
  const takenSlots = takenFor && takenFor.key === takenKey ? takenFor.slots : [];
  const slotTaken = preferredDate ? overlapsTakenSlot(preferredDate, takenSlots) : false;

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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Header / back */}
        <FadeItem index={0}>
          <View className="mt-2">
            <BackHeader title="Details" onBack={() => router.back()} />
          </View>
        </FadeItem>

        {/* Profile card */}
        <FadeItem index={1}>
          <ClinicalCard className="mt-5 flex-col gap-4">
            <View className="flex-row items-center gap-3">
              <View className="flex-col flex-1">
                <Text className="font-bold text-lg" style={{ color: theme.colors.ink }}>
                  {params.name}
                </Text>
                <Text className="text-xs mt-0.5" style={{ color: theme.colors.muted }}>
                  {params.specialty}
                </Text>
              </View>
              {availableToday && <Pill label="Available today" />}
            </View>

            <View
              className="flex-col gap-2 pt-3"
              style={{ borderTopWidth: 1, borderTopColor: theme.colors.divider }}
            >
              <View className="flex-row items-center gap-2">
                <Building size={16} color={theme.colors.faint} />
                <Text className="text-sm" style={{ color: theme.colors.body }}>
                  {params.clinic}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <MapPin size={16} color={theme.colors.faint} />
                <Text className="text-sm flex-1" style={{ color: theme.colors.body }}>
                  {params.address}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Navigation size={16} color={theme.colors.faint} />
                <Text className="text-sm" style={{ color: theme.colors.body }}>
                  {distanceKm.toFixed(1)} km away
                </Text>
              </View>
              {rating > 0 && (
                <View className="flex-row items-center gap-2">
                  <Star size={16} color={theme.colors.star} />
                  <Text className="text-sm font-semibold" style={{ color: theme.colors.ink }}>
                    {rating.toFixed(1)} rating
                  </Text>
                </View>
              )}
            </View>
          </ClinicalCard>
        </FadeItem>

        {/* About card — only for custom JSON entries with a description */}
        {customDescription ? (
          <FadeItem index={2}>
            <ClinicalCard className="mt-4 flex-col gap-2">
              <SectionTitle title="About" />
              <Text className="text-sm" style={{ color: theme.colors.body }}>
                {customDescription}
              </Text>
            </ClinicalCard>
          </FadeItem>
        ) : null}

        {/* Contact info card — verified clinics only. Unverified places are
            view-on-map only, so their (unverified) contact data isn't shown. */}
        {isCustomEntry ? (
          <FadeItem index={customDescription ? 3 : 2}>
            <ClinicalCard className="mt-4 flex-col gap-3">
              <SectionTitle title="Contact & Hours" />
              <View className="flex-col gap-2">
                <View className="flex-row items-center gap-2">
                  <Phone size={16} color={theme.colors.faint} />
                  {details.phone ? (
                    <Pressable onPress={() => Linking.openURL(`tel:${details.phone}`)}>
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: theme.colors.primary }}
                      >
                        {details.phone}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text className="text-sm" style={{ color: theme.colors.faint }}>
                      Not available
                    </Text>
                  )}
                </View>

                <View className="flex-row items-center gap-2">
                  <Globe size={16} color={theme.colors.faint} />
                  {details.website ? (
                    <Pressable onPress={() => Linking.openURL(details.website!)}>
                      <Text
                        className="text-sm font-semibold flex-1"
                        style={{ color: theme.colors.primary }}
                        numberOfLines={1}
                      >
                        {details.website}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text className="text-sm" style={{ color: theme.colors.faint }}>
                      Not available
                    </Text>
                  )}
                </View>

                <View className="flex-row items-center gap-2">
                  <Clock size={16} color={theme.colors.faint} />
                  <Text className="text-sm flex-1" style={{ color: theme.colors.body }}>
                    {details.openingHours ?? "Hours not available"}
                  </Text>
                </View>
              </View>
            </ClinicalCard>
          </FadeItem>
        ) : null}

        {/* Actions — verified clinics book a real visit; unverified places
            can only be viewed on the full map. */}
        <FadeItem index={customDescription ? 4 : 3}>
          <View className="mt-5 gap-3">
            {!isCustomEntry ? (
              <Notice
                icon={Info}
                tone="warning"
                copy="This location is not verified for this app. You can only view it on the map — booking is available at verified clinics only."
              />
            ) : null}
            {notice && Platform.OS !== "android" ? (
              <Notice icon={Info} tone="info" copy={notice} />
            ) : null}
            {isCustomEntry ? (
              <ClinicalCard className="flex-col gap-3">
                <SectionTitle title="Your visit" />
                <Text className="text-xs" style={{ color: theme.colors.muted }}>
                  Doctor (optional)
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => setDoctorId(null)}
                    className="rounded-full px-4 py-2.5 border active:opacity-80"
                    style={
                      doctorId === null
                        ? {
                            backgroundColor: theme.colors.primary,
                            borderColor: theme.colors.primary,
                          }
                        : { backgroundColor: "#FFFFFF", borderColor: theme.colors.cardBorder }
                    }
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: doctorId === null ? "#FFFFFF" : theme.colors.body }}
                    >
                      First available
                    </Text>
                  </Pressable>
                  {doctors.map((d) => {
                    const selected = doctorId === d.user_id;
                    return (
                      <Pressable
                        key={d.user_id}
                        onPress={() => setDoctorId(selected ? null : d.user_id)}
                        className="rounded-full px-4 py-2.5 border active:opacity-80"
                        style={
                          selected
                            ? {
                                backgroundColor: theme.colors.primary,
                                borderColor: theme.colors.primary,
                              }
                            : { backgroundColor: "#FFFFFF", borderColor: theme.colors.cardBorder }
                        }
                      >
                        <Text
                          className="text-sm font-semibold"
                          style={{ color: selected ? "#FFFFFF" : theme.colors.body }}
                        >
                          {d.display_name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {doctors.length === 0 ? (
                  <Text className="text-xs" style={{ color: theme.colors.faint }}>
                    No doctors listed yet — your request still goes to the clinic.
                  </Text>
                ) : null}
                <Text className="text-xs mt-1" style={{ color: theme.colors.muted }}>
                  Preferred date &amp; time (optional)
                </Text>
                <DateTimeField
                  value={preferredDate}
                  onChange={setPreferredDate}
                  placeholder="Pick a preferred slot"
                  minimumDate={new Date()}
                  fallbackDate={PREFERRED_FALLBACK}
                  onClear={() => setPreferredDate(null)}
                />
                {preferredDate && takenSlots.length > 0 ? (
                  <Text
                    className="text-xs"
                    style={{ color: slotTaken ? theme.colors.danger : theme.colors.muted }}
                  >
                    {slotTaken ? `${BOOKED_SLOT_MESSAGE} ` : ""}Already booked that day:{" "}
                    {takenSlots
                      .map((d) =>
                        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
                      )
                      .join(", ")}
                  </Text>
                ) : null}
                <View
                  className="flex-row items-center justify-between pt-3 mt-1"
                  style={{ borderTopWidth: 1, borderTopColor: theme.colors.divider }}
                >
                  <View className="flex-col flex-1 pr-3">
                    <Text className="text-sm font-semibold" style={{ color: theme.colors.ink }}>
                      Share my Skin Report with this clinic
                    </Text>
                    <Text className="text-xs mt-0.5" style={{ color: theme.colors.muted }}>
                      Includes your name, birth date, skin &amp; lifestyle answers, latest scan
                      photo, scan history and sensitivity log. Only this clinic&apos;s doctors can
                      open it.
                    </Text>
                  </View>
                  <Switch
                    value={shareReport}
                    onValueChange={setShareReport}
                    trackColor={{ false: theme.colors.cardBorder, true: theme.colors.primary }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel="Share my Skin Report with this clinic"
                  />
                </View>
              </ClinicalCard>
            ) : null}
            {isCustomEntry ? (
              <PrimaryButton
                label={booking ? "Sending request…" : "Book Appointment"}
                onPress={handleBook}
                loading={booking}
              />
            ) : (
              <PrimaryButton label="View on Map" onPress={openFullMap} />
            )}
          </View>
        </FadeItem>
      </ScrollView>

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
