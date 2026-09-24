import { ToastAndroid } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /network request failed|fetch failed|network|timeout|ECONNREFUSED|ENOTFOUND/i.test(msg);
}

async function uploadOnce(localUri: string): Promise<string | null> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    const msg = "Missing Cloudinary env vars";
    console.warn("[Cloudinary]", msg, { CLOUD_NAME, UPLOAD_PRESET });
    ToastAndroid.show(msg, ToastAndroid.LONG);
    return null;
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const formData = new FormData();
  formData.append("file", `data:image/jpeg;base64,${base64}`);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", "skinlens/scans");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  // Read text first: error bodies aren't always JSON, and awaiting .json()
  // before checking ok turns HTTP errors into confusing parse errors.
  const text = await response.text();
  let data: { secure_url?: string; error?: { message?: string } } | null =
    null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (response.ok && data?.secure_url) {
    return data.secure_url;
  }
  const errMsg =
    data?.error?.message || text.slice(0, 200) || `HTTP ${response.status}`;
  console.warn("[Cloudinary] Upload failed:", errMsg);
  ToastAndroid.show("Cloudinary: " + errMsg, ToastAndroid.LONG);
  return null;
}

export async function uploadImageToCloudinary(
  localUri: string,
  retries = 2,
): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = await uploadOnce(localUri);
      if (url) {
        return url;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Cloudinary] Upload attempt", attempt, "error:", msg);
      if (isNetworkError(err)) {
        return null;
      }
      ToastAndroid.show("Cloudinary error: " + msg, ToastAndroid.LONG);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  console.warn("[Cloudinary] All attempts failed for:", localUri);
  return null;
}
