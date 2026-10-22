import { loadTensorflowModel } from "react-native-fast-tflite";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";
import { Image } from "react-native";
import { createImageFaceDetector } from "react-native-vision-camera-face-detector";
import type { ImageFaceDetector } from "react-native-vision-camera-face-detector";

if (typeof (globalThis as Record<string, unknown>).Buffer === "undefined") {
  (globalThis as Record<string, unknown>).Buffer = Buffer;
}

// MobileFaceNet: 112x112 RGB input normalized to [-1, 1], 192-d embedding out.
// Same on-device pattern as utils/skin-prediction.ts (react-native-fast-tflite).
const FACE_SIZE = 112;
const EMBEDDING_DIM = 192;

// ML Kit image detector used to locate the face before embedding. Cropping to
// the face region instead of center-cropping the whole photo keeps the
// embedding stable when the face is framed smaller/offset (gallery uploads,
// varied distances) — the main cause of genuine users failing verification.
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

// Cosine similarity threshold for "same person".
// 0.45 keeps genuine re-scans (with the face-aware crop below) comfortably
// above across lighting/angle/distance changes while still rejecting
// different faces; raise to 0.55+ for stricter match acceptance if needed.
export const FACE_MATCH_THRESHOLD = 0.45;

let faceModel: Awaited<ReturnType<typeof loadTensorflowModel>> | null = null;

async function getFaceModel() {
  if (!faceModel) {
    console.log(`[SkinLens][FaceID] ${new Date().toISOString()} loading mobilefacenet.tflite`);
    const asset = Asset.fromModule(
      require("@/assets/models/mobilefacenet.tflite"),
    );
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error("Failed to resolve mobilefacenet.tflite asset");
    const t0 = Date.now();
    faceModel = await loadTensorflowModel({ url: uri }, []);
    console.log(`[SkinLens][FaceID] ${new Date().toISOString()} face model loaded in ${Date.now() - t0}ms`);
  }
  return faceModel;
}

type CropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

function tryGetImageSize(
  imageUri: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      imageUri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}

// Square region centered on the largest detected face (with margin), clamped
// to image bounds. Returns null when no face is found so the caller can fall
// back to the legacy center crop.
function detectFaceCropRect(
  imageUri: string,
  width: number,
  height: number,
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
    // Generous margin so the crop still covers hair + chin context.
    let side = Math.max(b.width, b.height) * 1.5;
    side = Math.min(side, width, height);
    if (!(side > 0)) return null;
    return {
      originX: Math.max(0, Math.min(width - side, Math.round(cx - side / 2))),
      originY: Math.max(0, Math.min(height - side, Math.round(cy - side / 2))),
      width: Math.round(side),
      height: Math.round(side),
    };
  } catch (err) {
    console.log(
      `[SkinLens][FaceID] ${new Date().toISOString()} face-crop detect failed, falling back to center crop:`,
      err,
    );
    return null;
  }
}

// Uniformly shaped 112x112 JPEG for whatever crop is requested; crop=null
// keeps the legacy behavior (center-crop when non-square, plain resize else).
async function shapeToFaceSize(
  imageUri: string,
  crop: CropRect | null,
): Promise<string> {
  const actions: ImageManipulator.Action[] = [];
  if (crop) actions.push({ crop });
  actions.push({ resize: { width: FACE_SIZE, height: FACE_SIZE } });
  try {
    const shaped = await ImageManipulator.manipulateAsync(
      imageUri,
      actions,
      {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false,
      },
    );
    return shaped.uri;
  } catch (err) {
    if (!crop) throw err;
    console.log(
      `[SkinLens][FaceID] ${new Date().toISOString()} face crop failed, falling back to resize:`,
      err,
    );
    const resized = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: FACE_SIZE, height: FACE_SIZE } }],
      {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false,
      },
    );
    return resized.uri;
  }
}

async function decodeToPixels(
  imageUri: string,
  crop: CropRect | null,
): Promise<jpeg.JpegBuffer> {
  // Center-crop to square first so wide captures don't stretch (legacy path);
  // with a face-aware crop we crop directly to the detected face region.
  let squareUri: string;
  if (crop) {
    squareUri = await shapeToFaceSize(imageUri, crop);
  } else {
    const size = await tryGetImageSize(imageUri);
    if (
      size &&
      size.width > 0 &&
      size.height > 0 &&
      size.width !== size.height
    ) {
      const side = Math.min(size.width, size.height);
      squareUri = await shapeToFaceSize(imageUri, {
        originX: Math.round((size.width - side) / 2),
        originY: Math.round((size.height - side) / 2),
        width: side,
        height: side,
      });
    } else {
      squareUri = await shapeToFaceSize(imageUri, null);
    }
  }
  const base64 = await FileSystem.readAsStringAsync(squareUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return jpeg.decode(bytes, { useTArray: true });
}

async function embeddingFromPixels(
  decoded: jpeg.JpegBuffer,
): Promise<number[]> {
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

  const model = await getFaceModel();
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

// Runs the face through MobileFaceNet and returns an L2-normalized embedding.
// Crops to the detected face region when possible for a stable embedding.
export async function getFaceEmbedding(imageUri: string): Promise<number[]> {
  console.log(`[SkinLens][FaceID] ${new Date().toISOString()} getFaceEmbedding start`);
  const t0 = Date.now();
  await getFaceModel();
  const dims = await tryGetImageSize(imageUri);
  const faceCrop = dims
    ? detectFaceCropRect(imageUri, dims.width, dims.height)
    : null;
  const decoded = await decodeToPixels(imageUri, faceCrop);
  const embedding = await embeddingFromPixels(decoded);
  console.log(`[SkinLens][FaceID] ${new Date().toISOString()} getFaceEmbedding done in ${Date.now() - t0}ms faceCrop=`, !!faceCrop);
  return embedding;
}

// Embeddings for every reasonable crop of the image (legacy center square +
// face-aware crop). Verification scores each against the enrolled embedding
// and passes if ANY crop matches — this avoids rejecting genuine users just
// because of framing.
export async function getFaceEmbeddingCandidates(
  imageUri: string,
): Promise<number[][]> {
  console.log(`[SkinLens][FaceID] ${new Date().toISOString()} getFaceEmbeddingCandidates start`);
  const t0 = Date.now();
  await getFaceModel();
  const dims = await tryGetImageSize(imageUri);
  const faceCrop = dims
    ? detectFaceCropRect(imageUri, dims.width, dims.height)
    : null;
  const candidates: number[][] = [];
  const centerCropped = await decodeToPixels(imageUri, null);
  candidates.push(await embeddingFromPixels(centerCropped));
  if (faceCrop) {
    const faceCropped = await decodeToPixels(imageUri, faceCrop);
    candidates.push(await embeddingFromPixels(faceCropped));
  }
  console.log(
    `[SkinLens][FaceID] ${new Date().toISOString()} getFaceEmbeddingCandidates done in ${Date.now() - t0}ms count=`,
    candidates.length,
  );
  return candidates;
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
  if (!json) {
    console.log(`[SkinLens][FaceID] ${new Date().toISOString()} parseEmbedding no stored embedding (grandfathered)`);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      Array.isArray(parsed) &&
      parsed.length === EMBEDDING_DIM &&
      parsed.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      return parsed as number[];
    }
    console.log(`[SkinLens][FaceID] ${new Date().toISOString()} parseEmbedding invalid shape len=`, Array.isArray(parsed) ? (parsed as unknown[]).length : -1);
    return null;
  } catch (err) {
    console.log(`[SkinLens][FaceID] ${new Date().toISOString()} parseEmbedding JSON error:`, err);
    return null;
  }
}
