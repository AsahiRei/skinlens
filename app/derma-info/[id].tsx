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
  ArrowLeft,
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
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  ClinicalCard,
  IconBadge,
  Notice,
  Pill,
  PrimaryButton,
  SecondaryButton,
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

const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? "";

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
  }>();

  const rating = Number(params.rating ?? 0);
  const distanceKm = Number(params.distanceKm ?? 0);
  const availableToday = params.availableToday === "true";

  // Verified entries (from the Supabase `clinics` table) arrive with their
  // contact info as nav params — use them directly instead of calling
  // Geoapify place-details.
  const isCustomEntry = params.isCustom === "1";
  const customDescription =
    (typeof params.description === "string" && params.description) || "";

  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [showBooked, setShowBooked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Real booking (verified clinics only — needs a Supabase clinic UUID).
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const [bookedDoctorName, setBookedDoctorName] = useState<string | null>(null);

  // Booking is only possible when the clinic exposed contact info.
  // Geoapify nearby results often have neither — don't let the user
  // tap Book with nowhere to send the PDF.
  const hasContact = !!details?.phone || !!details?.website;

  const notify = (msg: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      setNotice(msg);
    }
  };

  const handleBook = async () => {
    if (booking || loadingDetails) return;
    if (!hasContact) {
      notify("No contact info for this clinic yet. Try another one.");
      return;
    }
    // Non-verified (Geoapify) pins have no clinic UUID — keep the old
    // PDF-share flow so booking never fires without a real clinic row.
    if (!isCustomEntry || !params.id) {
      setBooking(true);
      try {
        await exportSkinReport();
        notify("Report ready — send the PDF, then call to confirm.");
        setShowBooked(true);
      } catch (err) {
        console.error("[book-appointment]", err);
        notify("Couldn't generate the PDF. Please try again.");
      } finally {
        setBooking(false);
      }
      return;
    }
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
      // appointment row so the doctor can open it from their queue.
      // 3. expo-print printToFileAsync -> expo-sharing shareAsync (SDK 57).
      // Opens the share sheet so the user can also send the PDF manually.
      try {
        const storagePath = await uploadSkinReportForAppointment(row.id);
        try {
          await attachReportToAppointment(row.id, storagePath);
        } catch (linkErr) {
          console.warn("[book-appointment] report link failed:", linkErr);
        }
      } catch (pdfErr) {
        // Booking already saved — PDF upload is best-effort from here.
        console.warn("[book-appointment] pdf upload failed:", pdfErr);
      }
      try {
        await exportSkinReport();
      } catch (pdfErr) {
        console.warn("[book-appointment] pdf share failed:", pdfErr);
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

  useEffect(() => {
    const fetchDetails = async () => {
      // Verified entries already carry phone/website/hours — no fetch needed.
      if (isCustomEntry) {
        setDetails({
          phone:
            (typeof params.phone === "string" && params.phone) || undefined,
          website:
            (typeof params.website === "string" && params.website) ||
            undefined,
          openingHours:
            (typeof params.hours === "string" && params.hours) || undefined,
        });
        setLoadingDetails(false);
        return;
      }
      if (!params.id) {
        setLoadingDetails(false);
        return;
      }
      setLoadingDetails(true);
      setDetailsError(null);
      try {
        const url =
          `https://api.geoapify.com/v2/place-details` +
          `?id=${encodeURIComponent(params.id)}&apiKey=${GEOAPIFY_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok)
          throw new Error(`Place Details request failed: ${res.status}`);
        const data = await res.json();
        const props = data.features?.[0]?.properties ?? {};
        const datasource = props.datasource?.raw ?? {};

        setDetails({
          phone:
            props.contact?.phone ??
            datasource.phone ??
            datasource["contact:phone"],
          website:
            props.website ??
            datasource.website ??
            datasource["contact:website"],
          openingHours: props.opening_hours ?? datasource.opening_hours,
        });
      } catch (err) {
        console.error(err);
        setDetailsError("Couldn't load extra details.");
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, params.phone, params.website, params.hours]);

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
          <View className="flex-row items-center gap-3 mt-2">
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-white"
              style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
            >
              <ArrowLeft size={18} color={theme.colors.primary} />
            </Pressable>
            <Text className="font-bold text-[20px]" style={{ color: theme.colors.ink }}>Details</Text>
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

        {/* Contact info card */}
        <FadeItem index={customDescription ? 3 : 2}>
          <ClinicalCard className="mt-4 flex-col gap-3">
            <SectionTitle title="Contact & Hours" />

            {loadingDetails ? (
              <View className="flex-col gap-2">
                <Skeleton className="h-4 w-2/3 rounded-lg" />
                <Skeleton className="h-4 w-1/2 rounded-lg" />
                <Skeleton className="h-4 w-3/4 rounded-lg" />
              </View>
            ) : detailsError ? (
              <Text className="text-xs" style={{ color: theme.colors.danger }}>{detailsError}</Text>
            ) : (
              <View className="flex-col gap-2">
                <View className="flex-row items-center gap-2">
                  <Phone size={16} color={theme.colors.faint} />
                  {details?.phone ? (
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
                  {details?.website ? (
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
                    {details?.openingHours ?? "Hours not available"}
                  </Text>
                </View>
              </View>
            )}
          </ClinicalCard>
        </FadeItem>

        {/* Book button — verified clinics create a real request row first,
            then share the PDF. Gated on contact info. */}
        <FadeItem index={customDescription ? 4 : 3}>
          <View className="mt-5 gap-3">
            {!loadingDetails && !hasContact && !detailsError ? (
              <Notice
                icon={Info}
                tone="warning"
                copy="No phone or website listed for this place, so booking isn't available. Pick a verified clinic or share your PDF manually from Progress."
              />
            ) : null}
            {notice && Platform.OS !== "android" ? (
              <Notice icon={Info} tone="info" copy={notice} />
            ) : null}
            {isCustomEntry && hasContact ? (
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
                        : { backgroundColor: "#FFFFFF", borderColor: "#E5EDE8" }
                    }
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: doctorId === null ? "#FFFFFF" : "#3F4A44" }}
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
                            : { backgroundColor: "#FFFFFF", borderColor: "#E5EDE8" }
                        }
                      >
                        <Text
                          className="text-sm font-semibold"
                          style={{ color: selected ? "#FFFFFF" : "#3F4A44" }}
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
            <PrimaryButton
              label={
                booking
                  ? isCustomEntry
                    ? "Sending request…"
                    : "Preparing PDF…"
                  : loadingDetails
                    ? "Loading clinic info…"
                    : hasContact
                      ? "Book Appointment"
                      : "Booking unavailable"
              }
              onPress={handleBook}
              loading={booking}
              disabled={loadingDetails || (!hasContact && !loadingDetails)}
            />
            <SecondaryButton
              label="My Appointments"
              onPress={() => router.push("/(modules)/appointments")}
            />
            {hasContact ? (
              <Text
                className="text-xs text-center leading-5"
                style={{ color: theme.colors.muted }}
              >
                {isCustomEntry
                  ? `Sends a booking request to ${params.name} and shares your Skin Report PDF — the doctor confirms your exact time.`
                  : `Generates your Skin Report PDF to send to ${params.name}, then call to confirm your slot.`}
              </Text>
            ) : null}
          </View>
        </FadeItem>
      </ScrollView>

      <UiModal
        visible={showBooked}
        onDismiss={() => setShowBooked(false)}
        title={isCustomEntry ? "Request sent" : "PDF sent — confirm by call"}
        message={
          isCustomEntry
            ? `Your visit request is with ${params.name}${bookedDoctorName ? ` (${bookedDoctorName})` : ""}. Track it under My Appointments — the doctor confirms your exact time.`
            : `Send the Skin Report PDF to ${params.name}, then confirm your slot directly with them.`
        }
        icon={CalendarCheck}
        tone="soft"
        actions={[
          {
            label: "View My Appointments",
            onPress: () => {
              setShowBooked(false);
              router.push("/(modules)/appointments");
            },
          } as const,
          ...(details?.phone
            ? [
                {
                  label: `Call ${details.phone}`,
                  onPress: () => {
                    setShowBooked(false);
                    Linking.openURL(`tel:${details.phone}`);
                  },
                } as const,
              ]
            : []),
          ...(details?.website
            ? [
                {
                  label: "Open clinic website",
                  kind: "secondary" as const,
                  onPress: () => {
                    setShowBooked(false);
                    if (details?.website) Linking.openURL(details.website);
                  },
                },
              ]
            : []),
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
