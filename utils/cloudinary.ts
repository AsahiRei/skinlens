import { ToastAndroid } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

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

  const data = await response.json();
  console.log("[Cloudinary] Status:", response.status, "Response:", JSON.stringify(data).slice(0, 500));
  if (data.secure_url) {
    return data.secure_url;
  }
  const errMsg = data.error?.message ?? JSON.stringify(data);
  console.warn("[Cloudinary] Upload failed:", errMsg);
  ToastAndroid.show("Cloudinary: " + errMsg, ToastAndroid.LONG);
  return null;
}

export async function uploadImageToCloudinary(
  localUri: string,
  retries = 2,
): Promise<string | null> {
  console.log("[Cloudinary] Starting upload for:", localUri);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = await uploadOnce(localUri);
      if (url) {
        console.log("[Cloudinary] Upload success:", url);
        return url;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Cloudinary] Upload attempt", attempt, "error:", msg);
      ToastAndroid.show("Cloudinary error: " + msg, ToastAndroid.LONG);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  console.warn("[Cloudinary] All attempts failed for:", localUri);
  return null;
}
