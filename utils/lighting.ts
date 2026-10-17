import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Buffer } from "buffer";
import jpeg from "jpeg-js";

import type { LightingQuality } from "@/types/schema";
import { evaluateLighting } from "@/utils/face-quality";

export type ImageLighting = {
  quality: LightingQuality;
  message: string;
  icon: "sun" | "moon" | "contrast";
  brightness: number;
  contrast: number;
};

/** Long edge of the analysis thumbnail — plenty for a luma estimate. */
const ANALYSIS_WIDTH = 160;

/** Centre fraction sampled (corners are usually background, not skin). */
const CENTER_FRACTION = 0.6;

/**
 * Qualities that make a frame unusable for classification: near-black or
 * blown out. "dim" / "bright" only warn — they still classify fine.
 */
export function blocksCapture(quality: LightingQuality): boolean {
  return quality === "dark" || quality === "glare";
}

/**
 * Pixel-based lighting check for an ALREADY CAPTURED image — the real
 * answer to "was this frame well lit?", unlike evaluateLighting on the live
 * preview (which only estimates brightness from face size + position).
 *
 * Shrinks the photo to a 160px thumbnail (same expo-image-manipulator +
 * jpeg-js pipeline as utils/skin-prediction.ts), computes luma mean and
 * standard deviation over the centre 60% region, and runs the shared
 * evaluateLighting() verdict on those numbers.
 *
 * Returns null on ANY failure (unreadable file, decode error, no pixels) so
 * callers fail open and never block a capture on a technicality.
 */
export async function measureImageLighting(
  uri: string,
): Promise<ImageLighting | null> {
  try {
    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: ANALYSIS_WIDTH } }],
      {
        compress: 0.5,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false,
      },
    );
    const base64 = await FileSystem.readAsStringAsync(resized.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Buffer.from(base64, "base64");
    const decoded = jpeg.decode(bytes, { useTArray: true });
    const { width, height, data } = decoded;
    if (!width || !height || !data || data.length < width * height * 4) {
      return null;
    }

    const x0 = Math.floor((width * (1 - CENTER_FRACTION)) / 2);
    const x1 = Math.ceil((width * (1 + CENTER_FRACTION)) / 2);
    const y0 = Math.floor((height * (1 - CENTER_FRACTION)) / 2);
    const y1 = Math.ceil((height * (1 + CENTER_FRACTION)) / 2);

    let count = 0;
    let sum = 0;
    let sumSq = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += luma;
        sumSq += luma * luma;
        count++;
      }
    }
    if (count === 0) return null;

    const mean = sum / count;
    const variance = Math.max(0, sumSq / count - mean * mean);
    const stddev = Math.sqrt(variance);
    const verdict = evaluateLighting(mean, stddev);
    return { ...verdict, brightness: mean, contrast: stddev };
  } catch (err) {
    console.warn("[lighting] pixel check failed, failing open:", err);
    return null;
  }
}
