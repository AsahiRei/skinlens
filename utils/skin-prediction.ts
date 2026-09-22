import { loadTensorflowModel } from "react-native-fast-tflite";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";
import type { ClassificationResult } from "@/types/skin";

if (typeof (globalThis as Record<string, unknown>).Buffer === "undefined") {
  (globalThis as Record<string, unknown>).Buffer = Buffer;
}

let model: Awaited<ReturnType<typeof loadTensorflowModel>> | null = null;

async function getModel() {
  if (!model) {
    model = await loadTensorflowModel(
      require("@/assets/models/detection_model.tflite"),
      [],
    );
  }
  return model;
}

const CLASS_LABELS = ["acne", "dry", "eczema", "normal", "oily"] as const;

async function decodeImageToPixels(
  imageUri: string,
  width: number,
  height: number,
): Promise<jpeg.JpegBuffer> {
  const resizedImage = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width, height } }],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: false,
    },
  );
  const base64 = await FileSystem.readAsStringAsync(resizedImage.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryString = atob(base64);
  const imageBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    imageBytes[i] = binaryString.charCodeAt(i);
  }
  return jpeg.decode(imageBytes, { useTArray: true });
}

function computeLightingGains(
  decoded: jpeg.JpegBuffer,
  width: number,
  height: number,
) {
  const totalPixels = width * height;
  let rSum = 0, gSum = 0, bSum = 0;
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
  const decoded = await decodeImageToPixels(imageUri, 512, 512);
  const { rGain, gGain, bGain, exposureGain } = computeLightingGains(
    decoded, 512, 512,
  );

  const w = decoded.width;
  const h = decoded.height;
  const enhanced = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = decoded.data[i] * rGain * exposureGain;
      let g = decoded.data[i + 1] * gGain * exposureGain;
      let b = decoded.data[i + 2] * bGain * exposureGain;
      if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
      if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;
      enhanced[i] = r;
      enhanced[i + 1] = g;
      enhanced[i + 2] = b;
      enhanced[i + 3] = 255;
    }
  }

  const encoded = jpeg.encode(
    { data: enhanced, width: w, height: h },
    90,
  );
  const outPath = `${FileSystem.cacheDirectory}enhanced_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(
    outPath,
    Buffer.from(encoded.data).toString("base64"),
    { encoding: FileSystem.EncodingType.Base64 },
  );
  return outPath;
}

export async function classifyImage(
  imageUri: string,
): Promise<ClassificationResult> {
  const tfliteModel = await getModel();
  const resizedImage = await ImageManipulator.manipulateAsync(
    imageUri,
    [
      {
        resize: {
          width: 224,
          height: 224,
        },
      },
    ],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: false,
    },
  );
  const base64 = await FileSystem.readAsStringAsync(resizedImage.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryString = atob(base64);
  const imageBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    imageBytes[i] = binaryString.charCodeAt(i);
  }
  const decoded = jpeg.decode(imageBytes, {
    useTArray: true,
  });
  if (decoded.width !== 224 || decoded.height !== 224) {
    throw new Error(
      `Unexpected image size: ${decoded.width}x${decoded.height}`,
    );
  }

  const totalPixels = 224 * 224;

  // Pass 1: compute per-channel averages for white balance + auto-exposure
  let rSum = 0, gSum = 0, bSum = 0;
  for (let y = 0; y < 224; y++) {
    for (let x = 0; x < 224; x++) {
      const i = (y * 224 + x) * 4;
      rSum += decoded.data[i];
      gSum += decoded.data[i + 1];
      bSum += decoded.data[i + 2];
    }
  }
  const rAvg = rSum / totalPixels;
  const gAvg = gSum / totalPixels;
  const bAvg = bSum / totalPixels;

  // Gray-world white balance: equalize channel averages
  const grayAvg = (rAvg + gAvg + bAvg) / 3;
  const rGain = rAvg > 0 ? grayAvg / rAvg : 1;
  const gGain = gAvg > 0 ? grayAvg / gAvg : 1;
  const bGain = bAvg > 0 ? grayAvg / bAvg : 1;

  // Auto-exposure: shift mean brightness toward mid-gray (127.5)
  const targetMean = 127.5;
  const currentMean = grayAvg;
  const exposureGain = currentMean > 0 ? targetMean / currentMean : 1;

  const input = new Float32Array(1 * 224 * 224 * 3);
  let index = 0;
  for (let y = 0; y < 224; y++) {
    for (let x = 0; x < 224; x++) {
      const i = (y * 224 + x) * 4;
      let r = decoded.data[i] * rGain * exposureGain;
      let g = decoded.data[i + 1] * gGain * exposureGain;
      let b = decoded.data[i + 2] * bGain * exposureGain;
      if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
      if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;
      input[index++] = r;
      input[index++] = g;
      input[index++] = b;
    }
  }

  const inputBuffer = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength,
  ) as ArrayBuffer;

  const output = await tfliteModel.run([inputBuffer]);
  const probabilities = new Float32Array(output[0]);

  if (probabilities.length !== CLASS_LABELS.length) {
    throw new Error(
      `Expected ${CLASS_LABELS.length} outputs, but model returned ${probabilities.length}`,
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

  return {
    label,
    confidence,
    probabilities: probabilityMap,
  };
}
