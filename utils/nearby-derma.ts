import * as Location from "expo-location";

import type { Dermatologist } from "@/types/schema";

const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? "";

export type NearbyClinicsResult = {
  clinics: Dermatologist[];
  userLocation: { latitude: number; longitude: number };
};

const NEARBY_INTENT_PATTERNS = [
  /nearby/i,
  /nearest/i,
  /near me/i,
  /close to me/i,
  /around me/i,
  /hospital/i,
  /clinic/i,
  /derma/i,
  /dermatologist/i,
  /skin (doctor|specialist|clinic)/i,
  /where (can|should|to).*(check|consult|go|visit)/i,
  /find.*(doctor|derma|clinic|hospital)/i,
];

/** Deterministic intent check — the on-device LLM is too small for function-calling. */
export function isNearbyClinicIntent(message: string): boolean {
  const q = message.toLowerCase();
  const hasPlace = /hospital|clinic|derma|dermatolog|doctor|specialist/.test(q);
  const hasProximity =
    /near|nearest|nearby|close|around|where|find|location|address|direction/.test(
      q,
    );
  if (hasPlace && hasProximity) return true;
  return NEARBY_INTENT_PATTERNS.some((re) => re.test(message));
}

export async function findNearbyDermatologists(
  limit = 5,
): Promise<NearbyClinicsResult> {
  if (!GEOAPIFY_API_KEY) {
    throw new Error("Missing Geoapify API key.");
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission denied.");
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

  type GeoapifyFeature = {
    properties: {
      place_id?: string;
      name?: string;
      formatted?: string;
      distance?: number;
    };
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

  // Dermatologists first, then nearest first (same as derma.tsx).
  mapped.sort((a, b) => {
    const aDerm = a.specialty === "Dermatology" ? 0 : 1;
    const bDerm = b.specialty === "Dermatology" ? 0 : 1;
    if (aDerm !== bDerm) return aDerm - bDerm;
    return a.distanceKm - b.distanceKm;
  });

  return {
    clinics: mapped.slice(0, limit),
    userLocation: { latitude, longitude },
  };
}

export function formatClinicsForChat(clinics: Dermatologist[]): string {
  if (clinics.length === 0) {
    return "I couldn't find any hospitals or clinics within 5 km of you.";
  }
  const lines = clinics.map((c, i) => {
    const dist =
      c.distanceKm > 0 ? ` (${c.distanceKm.toFixed(1)} km away)` : "";
    return `${i + 1}. ${c.name}${dist} — ${c.address}`;
  });
  return (
    `Here are the nearest hospitals/clinics I found within 5 km:\n` +
    lines.join("\n") +
    `\nTap View more for details, or open the Derma tab for the full map.`
  );
}
