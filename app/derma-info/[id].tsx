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
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
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
import { exportSkinReport } from "@/utils/report";
import customLocationsData from "@/data/derma-locations.json";

const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? "";

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
  }>();

  const rating = Number(params.rating ?? 0);
  const distanceKm = Number(params.distanceKm ?? 0);
  const availableToday = params.availableToday === "true";

  // Custom entries defined in `data/derma-locations.json` carry their own
  // info — use it directly instead of calling Geoapify place-details.
  const customEntry = (
    (customLocationsData as { locations?: Record<string, unknown>[] })
      .locations ?? []
  ).find((c) => (c as { id?: string }).id === params.id) as
    | {
        phone?: string;
        website?: string;
        hours?: string;
        description?: string;
      }
    | undefined;
  const isCustomEntry = params.isCustom === "1" || !!customEntry;
  const customDescription =
    (typeof params.description === "string" && params.description) ||
    customEntry?.description ||
    "";

  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [showBooked, setShowBooked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
    setBooking(true);
    try {
      // expo-print printToFileAsync -> expo-sharing shareAsync (SDK 57).
      // Opens the share sheet so the user sends the Skin Report PDF
      // to the clinic (Gmail / Messenger / Drive), then calls them.
      await exportSkinReport();
      setShowBooked(false);
      notify("Report ready — send the PDF, then call to confirm.");
      setShowBooked(true);
    } catch (err) {
      console.error("[book-appointment]", err);
      notify("Couldn't generate the PDF. Please try again.");
    } finally {
      setBooking(false);
    }
  };

  useEffect(() => {
    const fetchDetails = async () => {
      // Custom JSON entries already carry phone/website/hours — no fetch needed.
      if (isCustomEntry) {
        setDetails({
          phone:
            (typeof params.phone === "string" && params.phone) ||
            customEntry?.phone ||
            undefined,
          website:
            (typeof params.website === "string" && params.website) ||
            customEntry?.website ||
            undefined,
          openingHours:
            (typeof params.hours === "string" && params.hours) ||
            customEntry?.hours ||
            undefined,
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

        {/* Book button — gated on contact info, sends PDF */}
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
            <PrimaryButton
              label={
                booking
                  ? "Preparing PDF…"
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
            {hasContact ? (
              <Text
                className="text-xs text-center leading-5"
                style={{ color: theme.colors.muted }}
              >
                Generates your Skin Report PDF to send to {params.name}, then
                call to confirm your slot.
              </Text>
            ) : null}
          </View>
        </FadeItem>
      </ScrollView>

      <UiModal
        visible={showBooked}
        onDismiss={() => setShowBooked(false)}
        title="PDF sent — confirm by call"
        message={`Send the Skin Report PDF to ${params.name}, then confirm your slot directly with them.`}
        icon={CalendarCheck}
        tone="soft"
        actions={[
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
