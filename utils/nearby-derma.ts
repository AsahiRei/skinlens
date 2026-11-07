import * as Location from "expo-location";

import { getVerifiedClinics } from "@/lib/db/clinics";
import type { ChatClinic, ChatUserContext } from "@/types/chat";
import { searchLiveClinics } from "@/utils/clinic-search";

const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? "";

/** Verified (bookable) clinics are worth showing even if a bit farther. */
const VERIFIED_MAX_KM = 50;

type Coords = { latitude: number; longitude: number };

const PLACE_RE =
  /\b(derma\w*|skin (doctor|specialist|clinic)|clinics?|hospitals?|doctors?|specialists?)\b/;
const PROXIMITY_RE =
  /\b(near|nearby|nearest|close to|closest|around (me|here)|in my (area|city|place)|where|find|locat\w*|address|directions?|look(ing)? for|recommend an?|suggest an?|any good)\b/;
// "dermatologist-recommended sunscreen", "derma-approved" — product talk, not places.
const PRODUCT_CONTEXT_RE =
  /derma\w*[- ](recommended|approved|tested|grade)|\b(serum|sunscreen|cream|cleanser|moisturi[sz]er|product)s?\b/;

/** Deterministic intent check — the on-device LLM is too small for function-calling. */
export function isNearbyClinicIntent(message: string): boolean {
  const q = message.toLowerCase();
  if (!PLACE_RE.test(q) || !PROXIMITY_RE.test(q)) return false;
  if (PRODUCT_CONTEXT_RE.test(q) && !/\b(clinic|hospital|doctor)s?\b/.test(q)) {
    return false;
  }
  return true;
}

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function getUserLocation(): Promise<Coords | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

async function fetchLiveClinics(at: Coords): Promise<ChatClinic[]> {
  const { clinics } = await searchLiveClinics(at, GEOAPIFY_API_KEY);
  return clinics.map((c) => ({
    id: c.id,
    name: c.name,
    specialty: c.specialty,
    address: c.address,
    distanceKm: c.distanceKm,
    verified: false,
    latitude: c.latitude ?? undefined,
    longitude: c.longitude ?? undefined,
    rating: 0,
    availableToday: false,
  }));
}

export type NearbyClinicsResult = {
  clinics: ChatClinic[];
  /** Why the list may be incomplete (shown in the chat text). */
  locationStatus: "ok" | "denied" | "error";
};

/**
 * Verified clinics (bookable, from Supabase) first, then live dermatology clinics, then other
 * nearby clinics/hospitals. Never throws: falls back to verified clinics without distances.
 */
export async function findNearbyClinicsForChat(limit = 5): Promise<NearbyClinicsResult> {
  let location: Coords | null = null;
  let locationStatus: NearbyClinicsResult["locationStatus"] = "ok";
  try {
    location = await getUserLocation();
    if (!location) locationStatus = "denied";
  } catch (err) {
    console.warn("[chat] location failed:", err);
    locationStatus = "error";
  }

  const [verifiedRows, live] = await Promise.all([
    getVerifiedClinics().catch(() => []),
    location
      ? fetchLiveClinics(location).catch((err) => {
          console.warn("[chat] nearby clinics failed:", err);
          return [] as ChatClinic[];
        })
      : Promise.resolve([] as ChatClinic[]),
  ]);

  let verified: ChatClinic[] = verifiedRows.map((c) => ({
    id: c.id,
    name: c.name,
    specialty: c.specialty,
    address: c.address,
    distanceKm: location ? haversineKm(location, c) : 0,
    verified: true,
    latitude: c.latitude,
    longitude: c.longitude,
    rating: c.rating,
    availableToday: c.availableToday,
    phone: c.phone,
    website: c.website,
    hours: c.hours,
    description: c.description,
  }));
  if (location) {
    verified = verified
      .filter((c) => c.distanceKm <= VERIFIED_MAX_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  // live is already sorted: dermatology → hospitals → other, then by distance.
  // At most 3 verified so live nearby options still appear.
  const picked = [...verified.slice(0, 3)];
  for (const c of live) {
    if (picked.length >= limit) break;
    if (!picked.some((p) => p.name.toLowerCase() === c.name.toLowerCase())) picked.push(c);
  }
  return { clinics: picked, locationStatus };
}

/**
 * Chat text for the clinic cards, with a personal note when the user's
 * latest scan makes a visit more worthwhile.
 */
export function formatClinicsReply(result: NearbyClinicsResult, ctx?: ChatUserContext): string {
  const { clinics, locationStatus } = result;
  const parts: string[] = [];

  if (clinics.length === 0) {
    parts.push(
      locationStatus === "denied"
        ? "I need location permission to find dermatologists near you. You can allow it in Settings, or open the Derma tab to search."
        : "I couldn't find dermatology clinics or hospitals near you. Try the Derma tab to search, or ask a nearby clinic for a referral.",
    );
  } else {
    const verifiedCount = clinics.filter((c) => c.verified).length;
    const dermaCount = clinics.filter((c) => /derma/i.test(c.specialty)).length;
    if (locationStatus === "ok") {
      parts.push(
        dermaCount > 0
          ? `I found ${clinics.length} places near you, including ${dermaCount} with dermatology services.`
          : `I found ${clinics.length} clinics and hospitals near you. None are listed as dermatology yet, so call ahead to ask if a dermatologist is available.`,
      );
    } else {
      parts.push(
        "I couldn't get your location, so here are our verified clinics instead (no distances).",
      );
    }
    if (verifiedCount > 0) {
      parts.push("Verified clinics let you book an appointment right in the app.");
    }
  }

  // Personal nudge from the user's scan data.
  const severity = ctx?.severity?.toLowerCase() ?? "";
  if (/severe|high/.test(severity)) {
    parts.push(
      `Since your last scan was rated ${ctx?.severity}, booking a visit soon is a good idea. You can attach your SkinLens report when you book.`,
    );
  } else if (ctx?.score_trend === "declining") {
    parts.push(
      "Your skin score has been going down lately, so a check-up could help find out why.",
    );
  }
  return parts.join(" ");
}
