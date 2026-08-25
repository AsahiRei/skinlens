import { View, Text, Pressable, ScrollView, Linking } from "react-native";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import Ionicons from "@react-native-vector-icons/ionicons";
import Skeleton from "@/components/Skeleton";

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
  }>();

  const rating = Number(params.rating ?? 0);
  const distanceKm = Number(params.distanceKm ?? 0);
  const availableToday = params.availableToday === "true";

  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetails = async () => {
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
  }, [params.id]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Header / back */}
        <View className="flex-row items-center gap-3 mt-2">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"
          >
            <Ionicons name="arrow-back" size={18} color="#15803D" />
          </Pressable>
          <Text className="font-bold text-green-700 text-xl">Details</Text>
        </View>

        {/* Profile card */}
        <View className="bg-white rounded-3xl shadow-sm py-5 px-4 mt-5 flex-col gap-4">
          <View className="flex-row items-center gap-3">
            <View className="bg-green-100 h-14 w-14 items-center justify-center rounded-2xl">
              <Ionicons name="person-outline" size={26} color="#15803D" />
            </View>
            <View className="flex-col flex-1">
              <Text className="font-bold text-gray-900 text-lg">
                {params.name}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {params.specialty}
              </Text>
            </View>
            {availableToday && (
              <View className="bg-green-50 rounded-full px-2.5 py-1">
                <Text className="text-[10px] font-bold text-green-700">
                  Available today
                </Text>
              </View>
            )}
          </View>

          <View className="flex-col gap-2 pt-3 border-t border-gray-100">
            <View className="flex-row items-center gap-2">
              <Ionicons name="business-outline" size={16} color="#9CA3AF" />
              <Text className="text-sm text-gray-600">{params.clinic}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Ionicons name="location-outline" size={16} color="#9CA3AF" />
              <Text className="text-sm text-gray-600 flex-1">
                {params.address}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Ionicons name="navigate-outline" size={16} color="#9CA3AF" />
              <Text className="text-sm text-gray-600">
                {distanceKm.toFixed(1)} km away
              </Text>
            </View>
            {rating > 0 && (
              <View className="flex-row items-center gap-2">
                <Ionicons name="star" size={16} color="#F59E0B" />
                <Text className="text-sm font-semibold text-gray-700">
                  {rating.toFixed(1)} rating
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Contact info card */}
        <View className="bg-white rounded-3xl shadow-sm py-5 px-4 mt-4 flex-col gap-3">
          <Text className="font-bold text-gray-900 text-[15px]">
            Contact & Hours
          </Text>

          {loadingDetails ? (
            <View className="flex-col gap-2">
              <Skeleton className="h-4 w-2/3 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-lg" />
              <Skeleton className="h-4 w-3/4 rounded-lg" />
            </View>
          ) : detailsError ? (
            <Text className="text-xs text-red-500">{detailsError}</Text>
          ) : (
            <View className="flex-col gap-2">
              <View className="flex-row items-center gap-2">
                <Ionicons name="call-outline" size={16} color="#9CA3AF" />
                {details?.phone ? (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${details.phone}`)}
                  >
                    <Text className="text-sm text-green-700 font-semibold">
                      {details.phone}
                    </Text>
                  </Pressable>
                ) : (
                  <Text className="text-sm text-gray-400">Not available</Text>
                )}
              </View>

              <View className="flex-row items-center gap-2">
                <Ionicons name="globe-outline" size={16} color="#9CA3AF" />
                {details?.website ? (
                  <Pressable onPress={() => Linking.openURL(details.website!)}>
                    <Text
                      className="text-sm text-green-700 font-semibold flex-1"
                      numberOfLines={1}
                    >
                      {details.website}
                    </Text>
                  </Pressable>
                ) : (
                  <Text className="text-sm text-gray-400">Not available</Text>
                )}
              </View>

              <View className="flex-row items-center gap-2">
                <Ionicons name="time-outline" size={16} color="#9CA3AF" />
                <Text className="text-sm text-gray-600 flex-1">
                  {details?.openingHours ?? "Hours not available"}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Book button */}
        <Pressable className="bg-green-700 rounded-3xl shadow-sm py-4 px-4 mt-5 items-center active:opacity-90">
          <Text className="text-white font-bold text-[15px]">
            Book Appointment
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
