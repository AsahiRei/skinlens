/**
 * Live clinic search (Geoapify Places), shared by the Derma tab and the
 * chatbot's "find a dermatologist near me" intent.
 *
 * Classification uses Geoapify's own category tags first
 * (healthcare.clinic_or_praxis.dermatology, …) and the place name second,
 * and drops places that are clearly not useful for a skin concern
 * (dentists, pediatric, eye, OB clinics, vets).
 */

export type Coords = { latitude: number; longitude: number };

export type ClinicKind = "dermatology" | "hospital" | "general";

export type LiveClinic = {
  id: string;
  name: string;
  kind: ClinicKind;
  specialty: string;
  address: string;
  distanceKm: number;
  latitude: number | null;
  longitude: number | null;
};

export type LiveClinicSearch = {
  clinics: LiveClinic[];
  /** Radius (m) of the general nearby search. */
  nearbyRadiusM: number;
  /** Set when the dermatology-only search had to widen past the nearby radius. */
  widenedRadiusM: number | null;
};

export const NEARBY_RADIUS_M = 5000;
export const WIDE_DERMA_RADIUS_M = 30000;

const DERMA_CATEGORY = "healthcare.clinic_or_praxis.dermatology";

const EXCLUDED_CATEGORIES = [
  "healthcare.dentist",
  "healthcare.clinic_or_praxis.paediatrics",
  "healthcare.clinic_or_praxis.gynaecology",
  "healthcare.clinic_or_praxis.ophthalmology",
  "healthcare.clinic_or_praxis.psychiatry",
  "healthcare.clinic_or_praxis.radiology",
  "healthcare.clinic_or_praxis.orthopaedics",
  "healthcare.clinic_or_praxis.otolaryngology",
];

const DERMA_NAME_RE = /derma|skin|aesthetic|\bderm\b/i;
const EXCLUDED_NAME_RE =
  /\b(dental|dentist|dentistry|orthodont\w*|children'?s?|pediatric\w*|paediatric\w*|well[- ]baby|eye|optical|optometr\w*|ophthalm\w*|vet|veterinary|animal|pet|maternity|lying[- ]in|birthing|ob[- ]?gyne?|laborator(y|ies)|x-?ray)\b/i;

export function classifyPlace(name: string, categories: string[] = []): ClinicKind | "exclude" {
  const cats = categories ?? [];
  if (cats.some((c) => c.startsWith(DERMA_CATEGORY)) || DERMA_NAME_RE.test(name)) {
    return "dermatology";
  }
  if (cats.some((c) => EXCLUDED_CATEGORIES.some((x) => c.startsWith(x)))) return "exclude";
  if (EXCLUDED_NAME_RE.test(name)) return "exclude";
  if (cats.some((c) => c.startsWith("healthcare.hospital")) || /hospital|medical cent(er|re)/i.test(name)) {
    return "hospital";
  }
  return "general";
}

const SPECIALTY_LABEL: Record<ClinicKind, string> = {
  dermatology: "Dermatology",
  hospital: "Hospital",
  general: "General Clinic",
};

/**
 * Geoapify's `formatted` often starts with the place name, so the card
 * showed the name twice. Prefer `address_line2` (street/city part).
 */
export function cleanAddress(
  name: string,
  props: { address_line1?: string; address_line2?: string; formatted?: string },
): string {
  const norm = (s: string) => s.trim().toLowerCase();
  const line2 = props.address_line2?.trim();
  if (line2 && norm(line2) !== norm(name)) return line2;
  const formatted = props.formatted?.trim() ?? "";
  if (formatted) {
    const stripped = norm(formatted).startsWith(norm(name))
      ? formatted.slice(name.length).replace(/^[\s,]+/, "")
      : formatted;
    if (stripped && norm(stripped) !== norm(name)) return stripped;
  }
  return "Address unavailable";
}

type GeoapifyFeature = {
  properties: {
    place_id?: string;
    name?: string;
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    distance?: number;
    categories?: string[];
  };
  geometry?: { coordinates?: [number, number] };
};

export function mapFeatures(features: GeoapifyFeature[], idPrefix = ""): LiveClinic[] {
  const out: LiveClinic[] = [];
  features.forEach((f, idx) => {
    const name = f.properties.name?.trim();
    // Unnamed places can't be called or looked up — skip them.
    if (!name) return;
    const kind = classifyPlace(name, f.properties.categories);
    if (kind === "exclude") return;
    const [lon, lat] = f.geometry?.coordinates ?? [null, null];
    out.push({
      id: f.properties.place_id ?? `${idPrefix}${idx}`,
      name,
      kind,
      specialty: SPECIALTY_LABEL[kind],
      address: cleanAddress(name, f.properties),
      distanceKm: f.properties.distance ? f.properties.distance / 1000 : 0,
      latitude: lat ?? null,
      longitude: lon ?? null,
    });
  });
  return out;
}

const KIND_ORDER: Record<ClinicKind, number> = { dermatology: 0, hospital: 1, general: 2 };

export function sortClinics(clinics: LiveClinic[]): LiveClinic[] {
  return [...clinics].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.distanceKm - b.distanceKm,
  );
}

async function fetchPlaces(
  at: Coords,
  categories: string,
  radiusM: number,
  limit: number,
  apiKey: string,
): Promise<GeoapifyFeature[]> {
  const url =
    `https://api.geoapify.com/v2/places` +
    `?categories=${categories}` +
    `&filter=circle:${at.longitude},${at.latitude},${radiusM}` +
    `&bias=proximity:${at.longitude},${at.latitude}` +
    `&limit=${limit}&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geoapify request failed: ${res.status}`);
  const data = await res.json();
  return data.features ?? [];
}

/**
 * Nearby clinics + hospitals within 5 km. If none of them is a
 * dermatology clinic, run a second dermatology-only search out to 30 km
 * (common outside Metro Manila) and merge the results.
 */
export async function searchLiveClinics(at: Coords, apiKey: string): Promise<LiveClinicSearch> {
  if (!apiKey) return { clinics: [], nearbyRadiusM: NEARBY_RADIUS_M, widenedRadiusM: null };
  const nearby = mapFeatures(
    await fetchPlaces(at, "healthcare.clinic_or_praxis,healthcare.hospital", NEARBY_RADIUS_M, 30, apiKey),
  );
  let widenedRadiusM: number | null = null;
  let merged = nearby;
  if (!nearby.some((c) => c.kind === "dermatology")) {
    try {
      const wide = mapFeatures(
        await fetchPlaces(at, DERMA_CATEGORY, WIDE_DERMA_RADIUS_M, 10, apiKey),
        "wide-",
      );
      const seen = new Set(nearby.map((c) => c.id));
      const extra = wide.filter((c) => !seen.has(c.id));
      if (extra.length > 0) {
        widenedRadiusM = WIDE_DERMA_RADIUS_M;
        merged = [...nearby, ...extra];
      }
    } catch {
      // The nearby list is still useful on its own.
    }
  }
  return { clinics: sortClinics(merged), nearbyRadiusM: NEARBY_RADIUS_M, widenedRadiusM };
}
