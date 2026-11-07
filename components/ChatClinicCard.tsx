import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, MapPin, Stethoscope } from "lucide-react-native";

import { Text } from "@/components/Text";
import { Pill } from "@/components/ui";
import { theme } from "@/lib/theme";
import type { ChatClinic } from "@/types/chat";

/**
 * Clinic/hospital found from the chat. Opens the same detail screen as
 * the Derma tab: verified clinics get booking, live results get the map.
 */
export default function ChatClinicCard({ clinic }: { clinic: ChatClinic }) {
  const router = useRouter();

  const open = () =>
    router.push({
      pathname: "/derma-info/[id]",
      params: {
        id: clinic.id,
        name: clinic.name,
        specialty: clinic.specialty,
        clinic: clinic.name,
        address: clinic.address,
        distanceKm: String(clinic.distanceKm),
        rating: String(clinic.rating),
        availableToday: String(clinic.availableToday),
        ...(clinic.verified
          ? {
              phone: clinic.phone ?? "",
              website: clinic.website ?? "",
              hours: clinic.hours ?? "",
              description: clinic.description ?? "",
              isCustom: "1",
            }
          : {
              lat: String(clinic.latitude ?? ""),
              lng: String(clinic.longitude ?? ""),
            }),
      },
    });

  return (
    <Pressable
      onPress={open}
      className="rounded-xl px-3 py-2.5 flex-row gap-2.5 items-center active:opacity-80"
      style={{
        backgroundColor: theme.colors.primarySoft,
        borderWidth: 1,
        borderColor: theme.colors.cardBorder,
      }}
      accessibilityRole="button"
      accessibilityLabel={`${clinic.name}, ${clinic.specialty}${clinic.distanceKm > 0 ? `, ${clinic.distanceKm.toFixed(1)} kilometers away` : ""}. Open details`}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: theme.colors.primaryTint,
        }}
        className="items-center justify-center"
      >
        <Stethoscope size={18} color={theme.colors.primary} />
      </View>
      <View className="flex-1 min-w-0 gap-0.5">
        <Text
          className="text-[13px] font-bold"
          style={{ color: theme.colors.ink }}
          numberOfLines={2}
        >
          {clinic.name}
        </Text>
        <View className="flex-row items-center gap-1">
          <MapPin size={11} color={theme.colors.faint} />
          <Text
            className="text-[11px] flex-1"
            style={{ color: theme.colors.muted }}
            numberOfLines={1}
          >
            {clinic.distanceKm > 0 ? `${clinic.distanceKm.toFixed(1)} km • ` : ""}
            {clinic.address}
          </Text>
        </View>
        <View className="flex-row gap-1 mt-0.5">
          {clinic.verified ? <Pill label="Verified • Bookable" tone="warning" /> : null}
          <Pill
            label={clinic.specialty}
            tone={/derma/i.test(clinic.specialty) ? "primary" : "neutral"}
          />
        </View>
      </View>
      <ArrowRight size={16} color={theme.colors.primary} />
    </Pressable>
  );
}
