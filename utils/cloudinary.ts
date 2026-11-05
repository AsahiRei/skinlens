import * as FileSystem from "expo-file-system/legacy";

import { supabase } from "@/utils/supabase";

// Signed uploads: the `cloudinary` Edge Function (supabase/functions) holds
// the API secret and returns a short-lived signature scoped to the caller's
// own folder (skinlens/users/<uid>/<kind>).
//
// LEGACY FALLBACK: while the function isn't deployed, uploads fall back to
// the unsigned preset if EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET is set. Remove
// that env var (and disable the preset in Cloudinary) once signing works —
// an unsigned preset in the APK lets anyone upload to the account.
const LEGACY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const LEGACY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

type UploadKind = "scans" | "faces";

type SignedParams = {
  cloudName: string;
  apiKey: string;
  folder: string;
  timestamp: number;
  signature: string;
};

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /network request failed|fetch failed|network|timeout|ECONNREFUSED|ENOTFOUND/i.test(msg);
}

function kindFromFolder(folder: string): UploadKind {
  return /faces/i.test(folder) ? "faces" : "scans";
}

async function getSignature(kind: UploadKind): Promise<SignedParams | null> {
  const { data, error } = await supabase.functions.invoke<SignedParams>(
    "cloudinary",
    { body: { action: "sign", kind } },
  );
  if (error || !data?.signature) {
    console.warn("[Cloudinary] signing unavailable:", error?.message ?? "no signature");
    return null;
  }
  return data;
}

async function postUpload(cloudName: string, form: FormData): Promise<string | null> {
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form },
  );
  // Read text first: error bodies aren't always JSON.
  const text = await response.text();
  let data: { secure_url?: string; error?: { message?: string } } | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (response.ok && data?.secure_url) return data.secure_url;
  console.warn(
    "[Cloudinary] Upload failed:",
    data?.error?.message || text.slice(0, 200) || `HTTP ${response.status}`,
  );
  return null;
}

async function uploadOnce(localUri: string, kind: UploadKind): Promise<string | null> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const file = `data:image/jpeg;base64,${base64}`;

  const signed = await getSignature(kind);
  if (signed) {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signed.apiKey);
    form.append("timestamp", String(signed.timestamp));
    form.append("folder", signed.folder);
    form.append("signature", signed.signature);
    return postUpload(signed.cloudName, form);
  }

  if (LEGACY_CLOUD_NAME && LEGACY_UPLOAD_PRESET) {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", LEGACY_UPLOAD_PRESET);
    form.append("folder", `skinlens/${kind}`);
    return postUpload(LEGACY_CLOUD_NAME, form);
  }

  console.warn("[Cloudinary] no signing function and no legacy preset configured");
  return null;
}

/**
 * Uploads a local image and returns its HTTPS URL, or null on failure.
 * Never throws and never shows UI: callers already treat null as
 * "keep the local copy" (sync retries later).
 */
export async function uploadImageToCloudinary(
  localUri: string,
  retries = 2,
  folder = "skinlens/scans",
): Promise<string | null> {
  const kind = kindFromFolder(folder);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = await uploadOnce(localUri, kind);
      if (url) return url;
    } catch (err) {
      console.warn("[Cloudinary] Upload attempt", attempt, "error:", err);
      if (isNetworkError(err)) return null;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

/**
 * Deletes every image this user uploaded (account deletion). Best effort:
 * returns false when the Edge Function isn't deployed or the call fails.
 */
export async function purgeMyCloudinaryImages(): Promise<boolean> {
  const { error } = await supabase.functions.invoke("cloudinary", {
    body: { action: "purge" },
  });
  if (error) {
    console.warn("[Cloudinary] purge failed:", error.message);
    return false;
  }
  return true;
}
