import { loadTensorflowModel } from "react-native-fast-tflite";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";
import { Image } from "react-native";

if (typeof (globalThis as Record<string, unknown>).Buffer === "undefined") {
  (globalThis as Record<string, unknown>).Buffer = Buffer;
}

// MobileFaceNet: 112x112 RGB input normalized to [-1, 1], 192-d embedding out.
// Same on-device pattern as utils/skin-prediction.ts (react-native-fast-tflite).
const FACE_SIZE = 112;
const EMBEDDING_DIM = 192;

// Cosine similarity threshold for "same person".
// 0.55 is a relaxed default to reduce false rejections (FRR) in varied
// lighting/angles; raise to 0.60-0.70 for stricter FAR if needed.
export const FACE_MATCH_THRESHOLD = 0.55;

let faceModel: Awaited<ReturnType<typeof loadTensorflowModel>> | null = null;

async function getFaceModel() {
  if (!faceModel) {
    const asset = Asset.fromModule(
      require("@/assets/models/mobilefacenet.tflite"),
    );
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error("Failed to resolve mobilefacenet.tflite asset");
    faceModel = await loadTensorflowModel({ url: uri }, []);
  }
  return faceModel;
}

async function decodeToPixels(imageUri: string): Promise<jpeg.JpegBuffer> {
  // Center-crop to square first so wide captures don't stretch.
  let squareUri = imageUri;
  try {
    const size = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        Image.getSize(imageUri, (width, height) => resolve({ width, height }), reject);
      },
    );
    if (size.width > 0 && size.height > 0 && size.width !== size.height) {
      const side = Math.min(size.width, size.height);
      const cropped = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.round((size.width - side) / 2),
              originY: Math.round((size.height - side) / 2),
              width: side,
              height: side,
            },
          },
          { resize: { width: FACE_SIZE, height: FACE_SIZE } },
        ],
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        },
      );
      squareUri = cropped.uri;
    } else {
      const resized = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: FACE_SIZE, height: FACE_SIZE } }],
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        },
      );
      squareUri = resized.uri;
    }
  } catch {
    const resized = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: FACE_SIZE, height: FACE_SIZE } }],
      {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false,
      },
    );
    squareUri = resized.uri;
  }
  const base64 = await FileSystem.readAsStringAsync(squareUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return jpeg.decode(bytes, { useTArray: true });
}

// Runs the face through MobileFaceNet and returns an L2-normalized embedding.
export async function getFaceEmbedding(imageUri: string): Promise<number[]> {
  const model = await getFaceModel();
  const decoded = await decodeToPixels(imageUri);
  if (decoded.width !== FACE_SIZE || decoded.height !== FACE_SIZE) {
    throw new Error(
      `Unexpected face image size: ${decoded.width}x${decoded.height}`,
    );
  }

  const input = new Float32Array(1 * FACE_SIZE * FACE_SIZE * 3);
  let idx = 0;
  const total = FACE_SIZE * FACE_SIZE;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    // Normalize RGB 0..255 -> -1..1 (MobileFaceNet convention)
    input[idx++] = (decoded.data[o] / 127.5 - 1.0);
    input[idx++] = (decoded.data[o + 1] / 127.5 - 1.0);
    input[idx++] = (decoded.data[o + 2] / 127.5 - 1.0);
  }
  const inputBuffer = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength,
  ) as ArrayBuffer;

  const output = await model.run([inputBuffer]);
  const raw = new Float32Array(output[0]);
  if (raw.length !== EMBEDDING_DIM) {
    throw new Error(
      `Expected ${EMBEDDING_DIM}-d face embedding, got ${raw.length}-d`,
    );
  }

  // L2-normalize so cosine similarity is a plain dot product.
  let norm = 0;
  for (let i = 0; i < raw.length; i++) norm += raw[i] * raw[i];
  norm = Math.sqrt(norm);
  if (norm === 0) throw new Error("Face model returned a zero embedding");
  return Array.from(raw, (v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // Inputs are L2-normalized, so dot product == cosine similarity.
  // Clamp for float noise.
  return Math.max(-1, Math.min(1, dot));
}

export function isSamePerson(
  live: number[],
  enrolled: number[],
  threshold: number = FACE_MATCH_THRESHOLD,
): boolean {
  return cosineSimilarity(live, enrolled) >= threshold;
}

export function embeddingToJson(embedding: number[]): string {
  return JSON.stringify(embedding);
}

export function parseEmbedding(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      Array.isArray(parsed) &&
      parsed.length === EMBEDDING_DIM &&
      parsed.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      return parsed as number[];
    }
    return null;
  } catch {
    return null;
  }
}
