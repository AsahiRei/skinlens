import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { Camera, Map, Marker } from "@maplibre/maplibre-react-native";
import type { CameraRef, MapRef } from "@maplibre/maplibre-react-native";
import {
  Search,
  XCircle,
  Locate,
  Navigation,
  ArrowRight,
  Building,
  MapPin,
  Star,
  Stethoscope,
  Cross,
} from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import Skeleton from "@/components/Skeleton";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import {
  ClinicalCard,
  EmptyState,
  GradientHeroCta,
  IconBadge,
  Pill,
  ScreenHeader,
  SectionTitle,
} from "@/components/ui";
import type { Dermatologist } from "@/types/schema";
import { theme } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import { ScreenGradient } from "@/components/ScreenGradient";
import { getVerifiedClinics, type VerifiedClinic } from "@/lib/db/clinics";

const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? "";

const MAP_STYLE_URL = `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${GEOAPIFY_API_KEY}`;

type Coords = { latitude: number; longitude: number };

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function Derma() {
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<Dermatologist[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [clinicCoords, setClinicCoords] = useState<Record<string, Coords>>({});
  const [verified, setVerified] = useState<VerifiedClinic[]>([]);
  const [verifiedLoading, setVerifiedLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const router = useRouter();

  const loadVerified = useCallback(async () => {
    try {
      const rows = await getVerifiedClinics();
      setVerified(rows);
    } catch (err) {
      console.error("[derma] verified clinics failed:", err);
    }
  }, []);

  // Verified locations come from the Supabase `clinics` table (managed from
  // the website admin page), cached on-device for offline use.
  useEffect(() => {
    let active = true;
    loadVerified().finally(() => {
      if (active) setVerifiedLoading(false);
    });
    return () => {
      active = false;
    };
  }, [loadVerified]);

  const customResults: Dermatologist[] = verified.map((c) => ({
    id: c.id,
    name: c.name,
    specialty: c.specialty,
    clinic: c.clinic,
    address: c.address,
    distanceKm: 0,
    rating: c.rating,
    availableToday: c.availableToday,
  }));

  const customInfoById: Record<string, VerifiedClinic> = Object.fromEntries(
    verified.map((c) => [c.id, c]),
  );

  const customCoords: Record<string, Coords> = Object.fromEntries(
    verified.map((c) => [
      c.id,
      { latitude: c.latitude, longitude: c.longitude },
    ]),
  );

  const filtered = results.filter((d) =>
    `${d.name} ${d.specialty} ${d.clinic}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  // Verified locations from Supabase — shown instead of the empty state.
  // If we already know the user location, compute a real distance for sorting.
  const filteredCustom: Dermatologist[] = customResults
    .filter((d) =>
      `${d.name} ${d.specialty} ${d.clinic}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .map((d) => {
      const coord = customCoords[d.id];
      if (userLocation && coord) {
        return { ...d, distanceKm: haversineKm(userLocation, coord) };
      }
      return d;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  // Map pins: verified (pinned/validated) entries are ALWAYS shown.
  // Live results are added on top after a search — custom entries are never removed.
  const visiblePins = hasSearched
    ? [...filteredCustom, ...filtered]
    : filteredCustom;
  const visibleCoords: Record<string, Coords> = {
    ...customCoords,
    ...clinicCoords,
  };
  const mapCenter: Coords | null =
    userLocation ??
    (visiblePins.length > 0 ? visibleCoords[visiblePins[0].id] : undefined) ??
    null;
  const showMap =
    locating || hasSearched || filteredCustom.length > 0;

  const fetchNearbyAt = useCallback(async (latitude: number, longitude: number) => {
    const url =
      `https://api.geoapify.com/v2/places` +
      `?categories=healthcare.clinic_or_praxis,healthcare.hospital` +
      `&filter=circle:${longitude},${latitude},5000` +
      `&bias=proximity:${longitude},${latitude}` +
      `&limit=20&apiKey=${GEOAPIFY_API_KEY}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geoapify request failed: ${res.status}`);
    const data = await res.json();

    type GeoapifyFeature = {
      properties: {
        place_id?: string;
        name?: string;
        formatted?: string;
        distance?: number;
      };
      geometry?: { coordinates?: [number, number] };
    };
    const features: GeoapifyFeature[] = data.features ?? [];

    const mapped: Dermatologist[] = features.map((f, idx: number) => {
      const name = f.properties.name ?? "Unnamed Clinic";
      const isDerma = /derma|skin/i.test(name);
      return {
        id: f.properties.place_id ?? String(idx),
        name,
        specialty: isDerma ? "Dermatology" : "General Clinic",
        clinic: name,
        address: f.properties.formatted ?? "Address unavailable",
        distanceKm: f.properties.distance ? f.properties.distance / 1000 : 0,
        rating: 0,
        availableToday: false,
      };
    });

    // Keep a lookup of coordinates per result id so the map can pin them.
    const coordLookup: Record<string, Coords> = {};
    features.forEach((f, idx: number) => {
      const id = f.properties.place_id ?? String(idx);
      const [lon, lat] = f.geometry?.coordinates ?? [null, null];
      if (lat != null && lon != null) {
        coordLookup[id] = { latitude: lat, longitude: lon };
      }
    });
    setClinicCoords(coordLookup);

    // Dermatologists first, then nearest first.
    mapped.sort((a, b) => {
      const aDerm = a.specialty === "Dermatology" ? 0 : 1;
      const bDerm = b.specialty === "Dermatology" ? 0 : 1;
      if (aDerm !== bDerm) return aDerm - bDerm;
      return a.distanceKm - b.distanceKm;
    });

    setResults(mapped);
  }, []);

  const handleFindNearby = async () => {
    setErrorMsg(null);
    setLocating(true);
    setHasSearched(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Location permission denied.");
        setLocating(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });

      await fetchNearbyAt(latitude, longitude);
      // No flyTo needed here: the map mounts below with initialViewState
      // centered on the user location (calling flyTo on the not-yet-mounted
      // camera would silently do nothing).
    } catch (err) {
      console.error(err);
      setErrorMsg("Couldn't fetch nearby clinics. Try again.");
    } finally {
      setLocating(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    if (refreshing || locating) return;
    setRefreshing(true);
    setErrorMsg(null);
    try {
      await loadVerified();
      // If the user already ran Find Nearby, refresh that list too using the
      // last known location (avoids re-prompting for permission on pull).
      if (hasSearched && userLocation) {
        try {
          await fetchNearbyAt(userLocation.latitude, userLocation.longitude);
        } catch (err) {
          console.error(err);
          setErrorMsg("Couldn't fetch nearby clinics. Try again.");
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, [
    fetchNearbyAt,
    hasSearched,
    loadVerified,
    locating,
    refreshing,
    userLocation,
  ]);

  // Pinned/validated verified card (from the Supabase `clinics` table).
  // Shared by the pre-search list and the pinned section after a live search.
  const renderCustomCard = (d: Dermatologist, idx: number) => {
    const extra = customInfoById[d.id];
    return (
      <FadeItem key={d.id} index={Math.min(4 + idx, 8)}>
        <ClinicalCard key={d.id} className="flex-col gap-3">
          <View className="flex-row items-center gap-3">
            <IconBadge icon={Stethoscope} size="lg" tone="soft" />
            <View className="flex-col flex-1">
              <Text className="font-bold text-[15px]" style={{ color: "#10241A" }}>
                {d.name}
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                {d.specialty}
              </Text>
            </View>
            <View className="flex-col items-end gap-1">
              <Pill label="Verified" tone="warning" />
              {d.availableToday && (
                <Pill label="Available today" />
              )}
            </View>
          </View>

          <View className="flex-col gap-1 pt-3" style={{ borderTopWidth: 1, borderTopColor: "#EEF2EF" }}>
            <View className="flex-row items-center gap-2">
              <Building
                size={14}
                color="#9CA3AF"
              />
              <Text className="text-xs" style={{ color: "#3F4A44" }}>{d.clinic}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <MapPin
                size={14}
                color="#9CA3AF"
              />
              <Text
                className="text-xs flex-1"
                style={{ color: "#3F4A44" }}
                numberOfLines={1}
              >
                {d.address}
              </Text>
            </View>
            {extra?.description ? (
              <Text className="text-xs mt-1" style={{ color: "#6B7280" }} numberOfLines={2}>
                {extra.description}
              </Text>
            ) : null}
          </View>

          <View className="flex-row items-center justify-between pt-1">
            <View className="flex-row items-center gap-3">
              {d.rating > 0 && (
                <View className="flex-row items-center gap-1">
                  <Star size={14} color="#F59E0B" />
                  <Text className="text-xs font-semibold" style={{ color: "#10241A" }}>
                    {d.rating.toFixed(1)}
                  </Text>
                </View>
              )}
              <Text className="text-xs" style={{ color: "#9CA3AF" }}>
                {d.distanceKm > 0 ? `${d.distanceKm.toFixed(1)} km away` : "Nearby"}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/derma-info/[id]",
                  params: {
                    id: d.id,
                    name: d.name,
                    specialty: d.specialty,
                    clinic: d.clinic,
                    address: d.address,
                    distanceKm: String(d.distanceKm),
                    rating: String(d.rating),
                    availableToday: String(d.availableToday),
                    // Extra info comes from the Supabase `clinics` table.
                    phone: extra?.phone ?? "",
                    website: extra?.website ?? "",
                    hours: extra?.hours ?? "",
                    description: extra?.description ?? "",
                    isCustom: "1",
                  },
                })
              }
              className="rounded-full active:opacity-80"
              style={{ borderRadius: 999, overflow: "hidden" }}
            >
              <LinearGradient
                colors={[...theme.gradients.dark]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                className="px-4 py-1.5"
              >
                <Text className="text-xs text-white font-bold">
                  View more
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ClinicalCard>
      </FadeItem>
    );
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <KeyboardAwareScroll
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#15803D"
            colors={["#15803D"]}
          />
        }
      >
        <FadeItem index={0}>
          <View className="mt-2">
            <ScreenHeader
              title="Find Dermatologist"
              subtitle="Skin specialists near you"
            />
          </View>
        </FadeItem>

        {/* Search bar */}
        <FadeItem index={1}>
          <View className="flex-row items-center bg-white px-4 py-3 mt-5 gap-2" style={{ borderRadius: theme.radius.input, borderWidth: 1, borderColor: theme.colors.cardBorder }}>
            <Search size={18} color="#9CA3AF" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, clinic, or specialty"
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm"
              style={{ color: "#10241A" }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <XCircle size={18} color="#D1D5DB" />
              </Pressable>
            )}
          </View>
        </FadeItem>

        {/* Find nearby CTA — dark gradient hero */}
        <FadeItem index={2}>
          <GradientHeroCta
            icon={locating ? Locate : Navigation}
            title={locating ? "Locating..." : "Find Nearby"}
            subtitle="Uses your current location · 5 km radius"
            onPress={handleFindNearby}
            disabled={locating}
            accessibilityLabel="Find nearby dermatologists"
            accessory={
              <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <ArrowRight size={16} color="white" />
              </View>
            }
          />
        </FadeItem>

        {errorMsg && (
          <Text className="text-xs mt-2 text-center" style={{ color: theme.colors.danger }}>
            {errorMsg}
          </Text>
        )}

        {/* Map: user location + clinic pins (custom pins before search) */}
        {showMap && (
          <View className="overflow-hidden mt-4 h-56" style={{ borderRadius: 20, borderWidth: 1, borderColor: "#E5EDE8", backgroundColor: "#EAF6EE" }}>
            {locating || !mapCenter ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <Map ref={mapRef} mapStyle={MAP_STYLE_URL} logo={false}>
                <Camera
                  ref={cameraRef}
                  initialViewState={{
                    center: [mapCenter.longitude, mapCenter.latitude],
                    zoom: 13,
                  }}
                />

                {/* You are here */}
                {userLocation && (
                  <Marker
                    id="user-location"
                    lngLat={[userLocation.longitude, userLocation.latitude]}
                  >
                    <View className="h-4 w-4 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: "#15803D" }} />
                  </Marker>
                )}

                {/* Clinic pins — verified entries get an amber pin (pinned/validated), live results green */}
                {visiblePins.map((d) => {
                  const coord = visibleCoords[d.id];
                  if (!coord) return null;
                  const isCustomPin = customInfoById[d.id] != null;
                  return (
                    <Marker
                      key={d.id}
                      id={`clinic-${d.id}`}
                      lngLat={[coord.longitude, coord.latitude]}
                      onPress={() =>
                        cameraRef.current?.flyTo({
                          center: [coord.longitude, coord.latitude],
                          zoom: 15,
                          duration: 400,
                        })
                      }
                    >
                      <View className="h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: isCustomPin ? "#B45309" : "#15803D" }}>
                        {isCustomPin ? (
                          <MapPin size={13} color="white" />
                        ) : (
                          <Cross size={13} color="white" />
                        )}
                      </View>
                    </Marker>
                  );
                })}
              </Map>
            )}
          </View>
        )}

        {/* Results header */}
        <FadeItem index={3}>
          {locating || hasSearched ? (
            filteredCustom.length === 0 && (
              <View className="mt-6 mb-2">
                <SectionTitle
                  title="Nearby clinics"
                  meta={!locating ? `${filtered.length} found` : undefined}
                />
              </View>
            )
          ) : (
            filteredCustom.length > 0 && (
              <View className="mt-6 mb-2">
                <SectionTitle
                  title="Recommended clinics"
                  meta={`${filteredCustom.length} saved`}
                />
              </View>
            )
          )}
        </FadeItem>

        {/* Results list */}
        {locating || verifiedLoading ? (
          <View className="flex-col gap-3 mt-2">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </View>
        ) : !hasSearched ? (
          filteredCustom.length === 0 ? (
            <FadeItem index={4}>
              <ClinicalCard className="mt-2">
                {customResults.length === 0 ? (
                  <EmptyState
                    icon={Navigation}
                    title="Search nearby"
                    copy="Tap Find Nearby to search clinics around you."
                  />
                ) : (
                  <EmptyState
                    icon={Cross}
                    title="No matches"
                    copy="No recommended clinics match your search."
                  />
                )}
              </ClinicalCard>
            </FadeItem>
          ) : (
            <View className="flex-col gap-3 mt-2">
              {filteredCustom.map(renderCustomCard)}
            </View>
          )
        ) : filteredCustom.length === 0 && filtered.length === 0 ? (
          <FadeItem index={4}>
            <ClinicalCard className="mt-2">
              <EmptyState
                icon={Cross}
                title="No matches"
                copy="No dermatologists match your search."
              />
            </ClinicalCard>
          </FadeItem>
        ) : (
          <View className="flex-col gap-3 mt-2">
            {/* Pinned / validated locations stay after Find Nearby */}
            {filteredCustom.length > 0 && (
              <View className="flex-col gap-3">
                <View className="mt-2">
                  <SectionTitle
                    title="Pinned locations"
                    meta={`${filteredCustom.length} verified`}
                  />
                </View>
                {filteredCustom.map(renderCustomCard)}
              </View>
            )}
            {filtered.length > 0 && filteredCustom.length > 0 && (
              <View className="mt-4 mb-[-4]">
                <SectionTitle
                  title="Nearby clinics"
                  meta={`${filtered.length} found`}
                />
              </View>
            )}
            {filtered.map((d, idx) => (
              <FadeItem key={d.id} index={Math.min(4 + idx, 8)}>
                <ClinicalCard key={d.id} className="flex-col gap-3">
                  <View className="flex-row items-center gap-3">
                    <IconBadge icon={Stethoscope} size="lg" tone="soft" />
                    <View className="flex-col flex-1">
                      <Text className="font-bold text-[15px]" style={{ color: "#10241A" }}>
                        {d.name}
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                        {d.specialty}
                      </Text>
                    </View>
                    {d.availableToday && (
                      <Pill label="Available today" />
                    )}
                  </View>

                  <View className="flex-col gap-1 pt-3" style={{ borderTopWidth: 1, borderTopColor: "#EEF2EF" }}>
                    <View className="flex-row items-center gap-2">
                      <Building
                        size={14}
                        color="#9CA3AF"
                      />
                      <Text className="text-xs" style={{ color: "#3F4A44" }}>{d.clinic}</Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <MapPin
                        size={14}
                        color="#9CA3AF"
                      />
                      <Text
                        className="text-xs flex-1"
                        style={{ color: "#3F4A44" }}
                        numberOfLines={1}
                      >
                        {d.address}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between pt-1">
                    <View className="flex-row items-center gap-3">
                      {d.rating > 0 && (
                        <View className="flex-row items-center gap-1">
                          <Star size={14} color="#F59E0B" />
                          <Text className="text-xs font-semibold" style={{ color: "#10241A" }}>
                            {d.rating.toFixed(1)}
                          </Text>
                        </View>
                      )}
                      <Text className="text-xs" style={{ color: "#9CA3AF" }}>
                        {d.distanceKm > 0 ? `${d.distanceKm.toFixed(1)} km away` : "Nearby"}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/derma-info/[id]",
                          params: {
                            id: d.id, // this IS the Geoapify place_id already
                            name: d.name,
                            specialty: d.specialty,
                            clinic: d.clinic,
                            address: d.address,
                            distanceKm: String(d.distanceKm),
                            rating: String(d.rating),
                            availableToday: String(d.availableToday),
                          },
                        })
                      }
                      className="rounded-full active:opacity-80"
                      style={{ borderRadius: 999, overflow: "hidden" }}
                    >
                      <LinearGradient
                        colors={[...theme.gradients.dark]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        className="px-4 py-1.5"
                      >
                        <Text className="text-xs text-white font-bold">
                          View more
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                </ClinicalCard>
              </FadeItem>
            ))}
          </View>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
