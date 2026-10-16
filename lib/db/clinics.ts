import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/utils/supabase";

// Verified hospitals — the source of truth is the Supabase `clinics` table
// (managed from the website admin page). Replaces the old hardcoded
// data/derma-locations.json. Last good fetch is cached on-device so the
// verified list still shows offline.
export type VerifiedClinic = {
  id: string;
  name: string;
  specialty: string;
  clinic: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  availableToday: boolean;
  phone: string;
  website: string;
  hours: string;
  description: string;
};

const CACHE_KEY = "skinlens_verified_clinics_v1";

type ClinicRow = {
  id: string;
  name?: string | null;
  specialty?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rating?: number | null;
  available_today?: boolean | null;
  phone?: string | null;
  website?: string | null;
  hours?: string | null;
  description?: string | null;
};

function toVerifiedClinic(row: ClinicRow): VerifiedClinic | null {
  if (typeof row.latitude !== "number" || typeof row.longitude !== "number") {
    return null;
  }
  const name = row.name?.trim() || "Verified Clinic";
  return {
    id: row.id,
    name,
    specialty: row.specialty?.trim() || "Dermatology",
    clinic: name,
    address: row.address?.trim() || "Address unavailable",
    latitude: row.latitude,
    longitude: row.longitude,
    rating: typeof row.rating === "number" ? row.rating : 0,
    availableToday: row.available_today === true,
    phone: row.phone ?? "",
    website: row.website ?? "",
    hours: row.hours ?? "",
    description: row.description ?? "",
  };
}

export async function getVerifiedClinics(): Promise<VerifiedClinic[]> {
  try {
    const { data, error } = await supabase
      .from("clinics")
      .select(
        "id, name, specialty, address, latitude, longitude, rating, available_today, phone, website, hours, description",
      )
      .eq("is_active", true)
      .order("name");

    if (error) throw error;

    const mapped = ((data ?? []) as ClinicRow[])
      .map(toVerifiedClinic)
      .filter((c): c is VerifiedClinic => c !== null);

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(mapped));
    return mapped;
  } catch (err) {
    // Offline or query failed — fall back to the last cached list.
    console.warn("[clinics] live fetch failed, using cache:", err);
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached) as VerifiedClinic[];
    } catch {
      /* corrupted cache — fall through to empty */
    }
    return [];
  }
}
