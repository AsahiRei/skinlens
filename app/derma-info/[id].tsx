import { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  User,
  Building,
  CalendarCheck,
  MapPin,
  Navigation,
  Star,
  Phone,
  Globe,
  Clock,
  Info,
} from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { DateTimeField } from "@/components/DateTimeField";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  BackHeader,
  ClinicalCard,
  IconBadge,
  Notice,
  Pill,
  PrimaryButton,
  SectionTitle,
  UiModal,
} from "@/components/ui";
import { theme } from "@/lib/theme";
import { ScreenGradient } from "@/components/ScreenGradient";
import { exportSkinReport, uploadSkinReportForAppointment } from "@/utils/report";
import {
  attachReportToAppointment,
  formatPatientDisplayName,
  getDoctorsForClinic,
  isRemoteImageUrl,
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
// Constructed here so render never calls Date.now() (purity rules) — the
// real value always comes from the native picker (event handler).
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

  // Verified entries (from the Supabase `clinics` table) arrive with their
  // contact info as nav params. Unverified (Geoapify) locations are
  // view-on-map only — no place-details fetch, no booking.
  const isCustomEntry = params.isCustom === "1";
  const customDescription =
    (typeof params.description === "string" && params.description) || "";

  const details: PlaceDetails = {
    phone: (typeof params.phone === "string" && params.phone) || undefined,
    website:
      (typeof params.website === "string" && params.website) || undefined,
    openingHours:
      (typeof params.hours === "string" && params.hours) || undefined,
  };

  const [booking, setBooking] = useState(false);
  const [showBooked, setShowBooked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Real booking (verified clinics only — needs a Supabase clinic UUID).
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const [bookedDoctorName, setBookedDoctorName] = useState<string | null>(null);

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

  const handleBook = async () => {
    if (!isCustomEntry || !params.id) return;
    if (booking) return;
    setBooking(true);
    try {
      // 1. Real booking request → appointments (status 'requested').
      // Requires network (RLS: patient insert own). Offline → error toast.
      // Snapshot the patient's display name onto the row so the doctor
      // queue shows it even when user_profile rows aren't doctor-readable.
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
      // 2. Generate the Skin Report PDF, upload it to the private `reports`
      // bucket (reports/<uid>/<appointment_id>.pdf) and link it to the
      // appointment row so the doctor can open it from their queue. Sending
      // the PDF stays a choice — the confirmation modal offers the option.
      try {
        const storagePath = await uploadSkinReportForAppointment(row.id);
        try {
          await attachReportToAppointment(row.id, storagePath);
        } catch (linkErr) {
          console.warn("[book-appointment] report link failed:", linkErr);
        }
      } catch (pdfErr) {
        // Booking already saved — PDF upload is best-effort, but the user
        // must SEE the failure (else the doctor's Report button is missing
        // with no clue why).
        console.warn("[book-appointment] pdf upload failed:", pdfErr);
        const detail =
          pdfErr instanceof Error ? pdfErr.message : String(pdfErr ?? "");
        notify(
          `Report PDF could not be attached: ${detail || "unknown error"}`,
        );
      }
      notify("Request sent — the doctor will confirm your exact time.");
      setShowBooked(true);
    } catch (err) {
      console.error("[book-appointment]", err);
      const msg = err instanceof Error ? err.message : "";
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
            <BackHeader
              title="Details"
              onBack={() => router.back()}
            />
          </View>
        </FadeItem>

        {/* Profile card */}
        <FadeItem index={1}>
          <ClinicalCard className="mt-5 flex-col gap-4">
            <View className="flex-row items-center gap-3">
              <IconBadge icon={User} size="lg" tone="soft" />
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

            <View className="flex-col gap-2 pt-3" style={{ borderTopWidth: 1, borderTopColor: theme.colors.divider }}>
              <View className="flex-row items-center gap-2">
                <Building size={16} color={theme.colors.faint} />
                <Text className="text-sm" style={{ color: theme.colors.body }}>{params.clinic}</Text>
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
                    <Pressable
                      onPress={() => Linking.openURL(`tel:${details.phone}`)}
                    >
                      <Text className="text-sm font-semibold" style={{ color: theme.colors.primary }}>
                        {details.phone}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text className="text-sm" style={{ color: theme.colors.faint }}>Not available</Text>
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
                    <Text className="text-sm" style={{ color: theme.colors.faint }}>Not available</Text>
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
                        ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
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
                            ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
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
              </ClinicalCard>
            ) : null}
            {isCustomEntry ? (
              <PrimaryButton
                label={booking ? "Sending request…" : "Book Appointment"}
                onPress={handleBook}
                loading={booking}
              />
            ) : (
              <PrimaryButton
                label="View on Map"
                icon={Navigation}
                onPress={openFullMap}
              />
            )}
          </View>
        </FadeItem>
      </ScrollView>

      <UiModal
        visible={showBooked}
        onDismiss={() => setShowBooked(false)}
        title="Request sent"
        message={`Your visit request is with ${params.name}${bookedDoctorName ? ` (${bookedDoctorName})` : ""} — the doctor confirms your exact time.`}
        icon={CalendarCheck}
        tone="soft"
        actions={[
          {
            label: "Send Skin Report PDF",
            kind: "secondary" as const,
            onPress: () => {
              setShowBooked(false);
              void exportSkinReport().catch(() => {
                notify("Couldn't generate the PDF. Please try again.");
              });
            },
          },
          {
            label: "Done",
            kind: "ghost" as const,
            onPress: () => setShowBooked(false),
          },
        ]}
      />
    </SafeAreaView>
  );
}
