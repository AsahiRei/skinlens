import { loadTensorflowModel } from "react-native-fast-tflite";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";
import { Image } from "react-native";
import type { ClassificationResult } from "@/types/skin";

if (typeof (globalThis as Record<string, unknown>).Buffer === "undefined") {
  (globalThis as Record<string, unknown>).Buffer = Buffer;
}

let model: Awaited<ReturnType<typeof loadTensorflowModel>> | null = null;

async function getModel() {
  if (!model) {
    console.log(
      `[SkinLens][Prediction] ${new Date().toISOString()} loading detection_model.tflite`,
    );
    // Resolve bundled asset to a file:// URI that works in both dev (http) and release (embedded)
    // builds.
    const asset = Asset.fromModule(require("@/assets/models/detection_model.tflite"));
    await asset.downloadAsync();
    // localUri is file:// on device after download; fall back to uri (http in dev).
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error("Failed to resolve detection_model.tflite asset");
    const t0 = Date.now();
    model = await loadTensorflowModel({ url: uri }, []);
    console.log(
      `[SkinLens][Prediction] ${new Date().toISOString()} model loaded in ${Date.now() - t0}ms uri=`,
      uri.slice(0, 80),
    );
  }
  return model;
}

// Must match the training order in skinlens-ml (model_effb0/tflite/labels.txt). The model is the
// EfficientNet-B0 fp16 export: input float32 [1,224,224,3] RGB in 0..255 (no normalisation — the
// model rescales internally); two outputs, told apart by length (5 = classes, 3 = severity).
// Both outputs are already temperature-calibrated softmax probabilities.
const CLASS_LABELS = ["acne", "eczema", "oily", "dry", "normal"] as const;
const SEVERITY_LABELS = ["mild", "moderate", "severe"] as const;

function getImageSize(imageUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      imageUri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err),
    );
  });
}

// Center-crop to square before resizing so wide (e.g. 1280x720 landscape)
// captures don't get stretched into squares — the old plain
// resize:{width,height} distorted faces and made post-scan previews look wide.
async function squareCropAndResize(imageUri: string, size: number): Promise<string> {
  try {
    const { width, height } = await getImageSize(imageUri);
    if (width > 0 && height > 0 && width !== height) {
      const side = Math.min(width, height);
      const originX = Math.round((width - side) / 2);
      const originY = Math.round((height - side) / 2);
      const cropped = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          { crop: { originX, originY, width: side, height: side } },
          { resize: { width: size, height: size } },
        ],
        {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        },
      );
      return cropped.uri;
    }
  } catch {
    // Fall through to plain resize when dimensions are unavailable.
  }
  const resized = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: size, height: size } }],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: false,
    },
  );
  return resized.uri;
}

async function decodeImageToPixels(
  imageUri: string,
  width: number,
  height: number,
): Promise<jpeg.JpegBuffer> {
  const squareUri = await squareCropAndResize(imageUri, width);
  const base64 = await FileSystem.readAsStringAsync(squareUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // Buffer.from handles base64 natively — the atob + per-charCodeAt loop it
  // replaced walked every byte in JS, twice per scan (enhance + classify).
  const imageBytes = Buffer.from(base64, "base64");
  return jpeg.decode(imageBytes, { useTArray: true });
}

function computeLightingGains(decoded: jpeg.JpegBuffer, width: number, height: number) {
  const totalPixels = width * height;
  let rSum = 0,
    gSum = 0,
    bSum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rSum += decoded.data[i];
      gSum += decoded.data[i + 1];
      bSum += decoded.data[i + 2];
    }
  }
  const rAvg = rSum / totalPixels;
  const gAvg = gSum / totalPixels;
  const bAvg = bSum / totalPixels;

  const grayAvg = (rAvg + gAvg + bAvg) / 3;
  const rGain = rAvg > 0 ? grayAvg / rAvg : 1;
  const gGain = gAvg > 0 ? grayAvg / gAvg : 1;
  const bGain = bAvg > 0 ? grayAvg / bAvg : 1;
  const exposureGain = grayAvg > 0 ? 127.5 / grayAvg : 1;

  return { rGain, gGain, bGain, exposureGain };
}

export async function enhanceImage(imageUri: string): Promise<string> {
  console.log(`[SkinLens][Prediction] ${new Date().toISOString()} enhanceImage start`);
  const t0 = Date.now();
  const decoded = await decodeImageToPixels(imageUri, 512, 512);
  const { rGain, gGain, bGain, exposureGain } = computeLightingGains(decoded, 512, 512);

  const w = decoded.width;
  const h = decoded.height;
  const enhanced = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = decoded.data[i] * rGain * exposureGain;
      let g = decoded.data[i + 1] * gGain * exposureGain;
      let b = decoded.data[i + 2] * bGain * exposureGain;
      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;
      if (r < 0) r = 0;
      if (g < 0) g = 0;
      if (b < 0) b = 0;
      enhanced[i] = r;
      enhanced[i + 1] = g;
      enhanced[i + 2] = b;
      enhanced[i + 3] = 255;
    }
  }

  const encoded = jpeg.encode({ data: enhanced, width: w, height: h }, 90);
  const outPath = `${FileSystem.cacheDirectory}enhanced_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outPath, Buffer.from(encoded.data).toString("base64"), {
    encoding: FileSystem.EncodingType.Base64,
  });
  console.log(
    `[SkinLens][Prediction] ${new Date().toISOString()} enhanceImage done in ${Date.now() - t0}ms out=`,
    outPath.slice(-60),
  );
  return outPath;
}

export async function classifyImage(imageUri: string): Promise<ClassificationResult> {
  console.log(
    `[SkinLens][Prediction] ${new Date().toISOString()} classifyImage start uri=`,
    imageUri?.slice(0, 100),
  );
  const t0 = Date.now();
  const tfliteModel = await getModel();
  const squareUri = await squareCropAndResize(imageUri, 224);
  const base64 = await FileSystem.readAsStringAsync(squareUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const imageBytes = Buffer.from(base64, "base64");
  const decoded = jpeg.decode(imageBytes, {
    useTArray: true,
  });
  if (decoded.width !== 224 || decoded.height !== 224) {
    throw new Error(`Unexpected image size: ${decoded.width}x${decoded.height}`);
  }

  // Raw RGB pixels, exactly as in training (center-crop + resize only). No white balance or
  // exposure correction here — the model never saw those during training, so applying them would
  // shift its inputs. (enhanceImage still does that, but only for the on-screen preview.)
  const input = new Float32Array(1 * 224 * 224 * 3);
  let index = 0;
  for (let p = 0; p < 224 * 224; p++) {
    const i = p * 4;
    input[index++] = decoded.data[i];
    input[index++] = decoded.data[i + 1];
    input[index++] = decoded.data[i + 2];
  }

  const output = await tfliteModel.run([input.buffer as ArrayBuffer]);
  const outputs = output.map((o) => new Float32Array(o as ArrayBuffer));
  const probabilities = outputs.find((o) => o.length === CLASS_LABELS.length);
  const severityProbs = outputs.find((o) => o.length === SEVERITY_LABELS.length);

  if (!probabilities) {
    throw new Error(
      `Expected a ${CLASS_LABELS.length}-class output, but model returned lengths ${outputs
        .map((o) => o.length)
        .join(",")}`,
    );
  }

  let maxIndex = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[maxIndex]) {
      maxIndex = i;
    }
  }

  const label = CLASS_LABELS[maxIndex];
  const confidence = probabilities[maxIndex];
  const probabilityMap: Record<string, number> = {};
  CLASS_LABELS.forEach((className, idx) => {
    probabilityMap[className] = probabilities[idx];
  });

  // Severity head is meaningless for "normal" skin, so only report it for a detected condition.
  let severity: ClassificationResult["severity"];
  if (severityProbs && label !== "normal") {
    let sevIndex = 0;
    for (let i = 1; i < severityProbs.length; i++) {
      if (severityProbs[i] > severityProbs[sevIndex]) sevIndex = i;
    }
    const severityProbabilities: Record<string, number> = {};
    SEVERITY_LABELS.forEach((s, idx) => {
      severityProbabilities[s] = severityProbs[idx];
    });
    severity = {
      label: SEVERITY_LABELS[sevIndex],
      confidence: severityProbs[sevIndex],
      probabilities: severityProbabilities,
    };
  }

  console.log(
    `[SkinLens][Prediction] ${new Date().toISOString()} classifyImage done in ${Date.now() - t0}ms label=`,
    label,
    `conf=`,
    confidence.toFixed(3),
    `severity=`,
    severity?.label ?? "-",
  );
  return {
    label,
    confidence,
    probabilities: probabilityMap,
    severity,
  };
}
