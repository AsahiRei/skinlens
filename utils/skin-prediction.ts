import { loadTensorflowModel } from "react-native-fast-tflite";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";

let model: Awaited<ReturnType<typeof loadTensorflowModel>> | null = null;

async function getModel() {
  if (!model) {
    model = await loadTensorflowModel(
      require("@/assets/models/detection_model.tflite"),
      ["android-gpu"],
    );
  }
  return model;
}

const CLASS_LABELS = ["acne", "eczema", "normal"] as const;

export type ClassificationResult = {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
};

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
  const binaryString = globalThis.atob(base64);
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
  const input = new Float32Array(1 * 224 * 224 * 3);
  let index = 0;
  for (let y = 0; y < 224; y++) {
    for (let x = 0; x < 224; x++) {
      const pixelIndex = (y * 224 + x) * 4;
      const r = decoded.data[pixelIndex];
      const g = decoded.data[pixelIndex + 1];
      const b = decoded.data[pixelIndex + 2];
      input[index++] = r / 127.5 - 1.0;
      input[index++] = g / 127.5 - 1.0;
      input[index++] = b / 127.5 - 1.0;
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
  CLASS_LABELS.forEach((className, index) => {
    probabilityMap[className] = probabilities[index];
  });
  return {
    label,
    confidence,
    probabilities: probabilityMap,
  };
}
