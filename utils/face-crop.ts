import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { createImageFaceDetector } from "react-native-vision-camera-face-detector";
import type { ImageFaceDetector } from "react-native-vision-camera-face-detector";

export type CropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

// Square side as a multiple of the detected face box.
export const FACE_CROP_MARGIN = 1.5;

// ML Kit still-image detector, shared by the scan crop and face verification.
let imageFaceDetector: ImageFaceDetector | null = null;
function getImageFaceDetector(): ImageFaceDetector {
  if (!imageFaceDetector) {
    imageFaceDetector = createImageFaceDetector({
      performanceMode: "accurate",
      minFaceSize: 0.1,
    });
  }
  return imageFaceDetector;
}

// Square region centered on the largest detected face (with margin), clamped to image bounds.
export function detectFaceCropRect(
  imageUri: string,
  width: number,
  height: number,
  margin: number = FACE_CROP_MARGIN,
): CropRect | null {
  try {
    const faces = getImageFaceDetector().detectFaces(imageUri);
    if (!faces || faces.length === 0) return null;
    let best = faces[0];
    for (const f of faces) {
      if (f.bounds.width * f.bounds.height > best.bounds.width * best.bounds.height) {
        best = f;
      }
    }
    const b = best.bounds;
    if (!(b.width > 0) || !(b.height > 0)) return null;
    // Bounds center wildly outside the image means the coordinates came back
    // in a different space — don't trust them.
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    if (cx < -width || cx > width * 2 || cy < -height || cy > height * 2) {
      return null;
    }
    let side = Math.max(b.width, b.height) * margin;
    side = Math.min(side, width, height);
    if (!(side > 0)) return null;
    return {
      originX: Math.max(0, Math.min(width - side, Math.round(cx - side / 2))),
      originY: Math.max(0, Math.min(height - side, Math.round(cy - side / 2))),
      width: Math.round(side),
      height: Math.round(side),
    };
  } catch (err) {
    console.log(`[SkinLens][FaceCrop] ${new Date().toISOString()} face detect failed:`, err);
    return null;
  }
}

export type FaceCropResult = {
  /** file:// URI of the square face crop, or of the original when not cropped. */
  uri: string;
  cropped: boolean;
};

/**
 * Crops a captured photo to a square around the face so the skin model sees skin, not background.
 * Never throws: any failure returns the original URI with cropped=false.
 */
export async function cropToFace(imageUri: string): Promise<FaceCropResult> {
  const t0 = Date.now();
  const ctx = ImageManipulator.manipulate(imageUri);
  try {
    const base = await ctx.renderAsync();
    const { width, height } = base;
    const normalized = await base.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
    base.release();

    const rect = detectFaceCropRect(normalized.uri, width, height);
    if (!rect) {
      console.log(
        `[SkinLens][FaceCrop] ${new Date().toISOString()} no face in still, keeping full photo`,
      );
      return { uri: imageUri, cropped: false };
    }

    const out = await ctx.crop(rect).renderAsync();
    const saved = await out.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
    out.release();
    console.log(
      `[SkinLens][FaceCrop] ${new Date().toISOString()} cropped ${width}x${height} -> ${rect.width}x${rect.height} in ${Date.now() - t0}ms`,
    );
    return { uri: saved.uri, cropped: true };
  } catch (err) {
    console.log(
      `[SkinLens][FaceCrop] ${new Date().toISOString()} crop failed, keeping full photo:`,
      err,
    );
    return { uri: imageUri, cropped: false };
  } finally {
    ctx.release();
  }
}
