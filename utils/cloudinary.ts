import * as FileSystem from "expo-file-system/legacy";

import { supabase } from "@/utils/supabase";

// Signed uploads: the `cloudinary` Edge Function (supabase/functions) holds the API secret and
// returns a short-lived signature scoped to the caller's own folder (skinlens/users/<uid>/<kind>).
// There is deliberately NO unsigned-preset fallback: an EXPO_PUBLIC_ preset is baked into the app
// bundle (anyone can extract it), and its uploads would land outside the user's folder where account
// deletion can't purge them. If signing is unavailable the upload returns null and sync retries.

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
  const { data, error } = await supabase.functions.invoke<SignedParams>("cloudinary", {
    body: { action: "sign", kind },
  });
  if (error || !data?.signature) {
    // FunctionsHttpError carries the Response; surface status + body (e.g. 404 = not deployed,
    // 500 = secrets missing, 401 = no session) instead of the generic "non-2xx" message.
    let detail = error?.message ?? "no signature";
    const res = (error as { context?: Response } | null)?.context;
    if (res && typeof res.text === "function") {
      try {
        detail = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      } catch {
        // keep the generic message
      }
    }
    console.warn("[Cloudinary] signing unavailable:", detail);
    return null;
  }
  return data;
}

async function postUpload(cloudName: string, form: FormData): Promise<string | null> {
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
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
  if (!signed) return null;

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("folder", signed.folder);
  form.append("signature", signed.signature);
  return postUpload(signed.cloudName, form);
}

/**
 * Uploads a local image and returns its HTTPS URL, or null on failure. Never throws and never shows
 * UI: callers already treat null as "keep the local copy" (sync retries later).
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

/** Deletes every image this user uploaded (account deletion). */
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
