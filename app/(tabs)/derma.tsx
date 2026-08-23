import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useState } from "react";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Location from "expo-location";
import Skeleton from "@/components/Skeleton";

type Dermatologist = {
  id: string;
  name: string;
  specialty: string;
  clinic: string;
  address: string;
  distanceKm: number;
  rating: number;
  availableToday: boolean;
};

const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? "";

export default function Derma() {
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<Dermatologist[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const filtered = results.filter((d) =>
    `${d.name} ${d.specialty} ${d.clinic}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

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

      const url =
        `https://api.geoapify.com/v2/places` +
        `?categories=healthcare.clinic_or_praxis,healthcare.hospital` +
        `&filter=circle:${longitude},${latitude},5000` +
        `&bias=proximity:${longitude},${latitude}` +
        `&limit=20&apiKey=${GEOAPIFY_API_KEY}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geoapify request failed: ${res.status}`);
      const data = await res.json();

      const mapped: Dermatologist[] = (data.features ?? []).map(
        (f: any, idx: number) => {
          const name = f.properties.name ?? "Unnamed Clinic";
          const isDerma = /derma|skin/i.test(name);
          return {
            id: f.properties.place_id ?? String(idx),
            name,
            specialty: isDerma ? "Dermatology" : "General Clinic",
            clinic: name,
            address: f.properties.formatted ?? "Address unavailable",
            distanceKm: f.properties.distance
              ? f.properties.distance / 1000
              : 0,
            rating: 0,
            availableToday: false,
          };
        },
      );

      mapped.sort((a, b) =>
        a.specialty === "Dermatology" && b.specialty !== "Dermatology" ? -1 : 0,
      );

      setResults(mapped);
    } catch (err) {
      console.error(err);
      setErrorMsg("Couldn't fetch nearby clinics. Try again.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <Text className="font-bold text-green-700 text-2xl">Dermatologist</Text>
        <Text className="text-gray-500">
          Find trusted skin specialists near you
        </Text>

        {/* Search bar */}
        <View className="flex-row items-center bg-white rounded-2xl shadow-sm px-4 py-3 mt-5 gap-2">
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, clinic, or specialty"
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-sm text-gray-800"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#D1D5DB" />
            </Pressable>
          )}
        </View>

        {/* Find nearby CTA */}
        <Pressable
          onPress={handleFindNearby}
          disabled={locating}
          className="bg-green-700 rounded-3xl shadow-sm py-4 px-4 mt-4 flex-row items-center justify-between active:opacity-90"
        >
          <View className="flex-row items-center gap-3 flex-1">
            <View className="bg-white/20 h-12 w-12 items-center justify-center rounded-2xl">
              <Ionicons
                name={locating ? "locate" : "navigate-outline"}
                size={22}
                color="white"
              />
            </View>
            <View className="flex-col flex-1">
              <Text className="font-bold text-white text-[15px]">
                {locating ? "Locating..." : "Find Dermatologist Nearby"}
              </Text>
              <Text className="text-xs text-green-100 mt-0.5">
                Uses your current location
              </Text>
            </View>
          </View>
          <View className="bg-white/20 h-9 w-9 items-center justify-center rounded-full">
            <Ionicons name="arrow-forward" size={16} color="white" />
          </View>
        </Pressable>

        {errorMsg && (
          <Text className="text-xs text-red-500 mt-2 text-center">
            {errorMsg}
          </Text>
        )}

        {/* Results header */}
        {(locating || hasSearched) && (
          <View className="flex-row items-center justify-between mt-6 mb-1">
            <Text className="font-bold text-gray-900 text-[15px]">
              Nearby Dermatologists
            </Text>
            {!locating && (
              <Text className="text-xs text-gray-400">
                {filtered.length} found
              </Text>
            )}
          </View>
        )}

        {/* Results list */}
        {locating ? (
          <View className="flex-col gap-3 mt-2">
            <Skeleton className="h-32 w-full rounded-3xl" />
            <Skeleton className="h-32 w-full rounded-3xl" />
            <Skeleton className="h-32 w-full rounded-3xl" />
          </View>
        ) : !hasSearched ? (
          <View className="items-center py-10 bg-white rounded-3xl shadow-sm mt-2">
            <Ionicons name="navigate-outline" size={26} color="#D1D5DB" />
            <Text className="text-xs text-gray-400 mt-2 text-center">
              Tap "Find Dermatologist Nearby" to search.
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View className="items-center py-10 bg-white rounded-3xl shadow-sm mt-2">
            <Ionicons name="medkit-outline" size={26} color="#D1D5DB" />
            <Text className="text-xs text-gray-400 mt-2 text-center">
              No dermatologists match your search.
            </Text>
          </View>
        ) : (
          <View className="flex-col gap-3 mt-2">
            {filtered.map((d) => (
              <View
                key={d.id}
                className="bg-white rounded-3xl shadow-sm py-4 px-4 flex-col gap-3"
              >
                <View className="flex-row items-center gap-3">
                  <View className="bg-green-100 h-12 w-12 items-center justify-center rounded-2xl">
                    <Ionicons name="person-outline" size={22} color="#15803D" />
                  </View>
                  <View className="flex-col flex-1">
                    <Text className="font-bold text-gray-900 text-[15px]">
                      {d.name}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-0.5">
                      {d.specialty}
                    </Text>
                  </View>
                  {d.availableToday && (
                    <View className="bg-green-50 rounded-full px-2.5 py-1">
                      <Text className="text-[10px] font-bold text-green-700">
                        Available today
                      </Text>
                    </View>
                  )}
                </View>

                <View className="flex-col gap-1 pt-3 border-t border-gray-100">
                  <View className="flex-row items-center gap-2">
                    <Ionicons
                      name="business-outline"
                      size={14}
                      color="#9CA3AF"
                    />
                    <Text className="text-xs text-gray-600">{d.clinic}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color="#9CA3AF"
                    />
                    <Text
                      className="text-xs text-gray-600 flex-1"
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
                        <Ionicons name="star" size={14} color="#F59E0B" />
                        <Text className="text-xs font-semibold text-gray-700">
                          {d.rating.toFixed(1)}
                        </Text>
                      </View>
                    )}
                    <Text className="text-xs text-gray-400">
                      {d.distanceKm.toFixed(1)} km away
                    </Text>
                  </View>
                  <Pressable className="bg-green-700 rounded-full px-4 py-1.5 active:opacity-80">
                    <Text className="text-xs text-white font-bold">Book</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
