import { initLlama, type LlamaContext } from "llama.rn";
import * as FileSystem from "expo-file-system/legacy";

const MODEL_FILENAME = "Llama-3.2-1B-Instruct-Q4_K_M.gguf";
const MODEL_URL =
  "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf";

let llamaContext: LlamaContext | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;

export async function getModelPath(
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const localPath = `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;
  const downloadResumable = FileSystem.createDownloadResumable(
    MODEL_URL,
    localPath,
    {},
    (progress) => {
      if (onProgress && progress.totalBytesExpectedToWrite > 0) {
        onProgress(
          progress.totalBytesWritten / progress.totalBytesExpectedToWrite,
        );
      }
    },
  );
  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) {
    throw new Error("Failed to download the AI model.");
  }
  return result.uri;
}

export async function getLlamaContext(
  onModelDownloadProgress?: (fraction: number) => void,
): Promise<LlamaContext> {
  if (llamaContext) return llamaContext;
  if (!llamaContextPromise) {
    llamaContextPromise = (async () => {
      const modelPath = await getModelPath(onModelDownloadProgress);
      const ctx = await initLlama({
        model: modelPath,
        n_ctx: 4096,
        n_threads: 4,
        n_gpu_layers: 0,
        n_batch: 128,
      });
      llamaContext = ctx;
      return ctx;
    })();
  }
  return llamaContextPromise;
}

export async function preloadLlama(onProgress?: (fraction: number) => void) {
  await getLlamaContext(onProgress);
}

export async function releaseLlama() {
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
    llamaContextPromise = null;
  }
}
