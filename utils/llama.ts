<<<<<<< HEAD
import * as FileSystem from "expo-file-system/legacy";
import { initLlama, type LlamaContext } from "llama.rn";
=======
import { initLlama, type LlamaContext } from "llama.rn";
import * as FileSystem from "expo-file-system/legacy";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38

const MODEL_FILENAME = "Llama-3.2-1B-Instruct-Q4_K_M.gguf";
const MODEL_URL =
  "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf";

let llamaContext: LlamaContext | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;
<<<<<<< HEAD
let activeDownload: FileSystem.DownloadResumable | null = null;
let downloadAborted = false;

const MAX_RETRIES = 3;
=======
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38

export async function getModelPath(
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const localPath = `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;
<<<<<<< HEAD

  downloadAborted = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (downloadAborted) {
      throw new Error("Download cancelled.");
    }

    const downloadResumable = FileSystem.createDownloadResumable(
      MODEL_URL,
      localPath,
      {},
      (progress) => {
        if (downloadAborted) return;
        if (onProgress && progress.totalBytesExpectedToWrite > 0) {
          onProgress(
            progress.totalBytesWritten / progress.totalBytesExpectedToWrite,
          );
        }
      },
    );
    activeDownload = downloadResumable;

    try {
      const result = await downloadResumable.downloadAsync();
      if (result?.uri) {
        activeDownload = null;
        return result.uri;
      }
      throw new Error("Failed to download the AI model.");
    } catch (err) {
      if (downloadAborted) {
        activeDownload = null;
        throw new Error("Download cancelled.");
      }

      // Try to resume on next attempt if partial file exists
      const partialInfo = await FileSystem.getInfoAsync(localPath);
      if (partialInfo.exists && attempt < MAX_RETRIES) {
        continue;
      }

      activeDownload = null;
      throw err;
    }
  }

  activeDownload = null;
  throw new Error("Failed to download the AI model after multiple attempts.");
=======
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
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
}

export async function getLlamaContext(
  onModelDownloadProgress?: (fraction: number) => void,
): Promise<LlamaContext> {
  if (llamaContext) return llamaContext;
  if (!llamaContextPromise) {
    llamaContextPromise = (async () => {
<<<<<<< HEAD
      try {
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
      } catch (err) {
        // Clear promise so callers can retry
        llamaContextPromise = null;
        throw err;
      }
=======
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
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
    })();
  }
  return llamaContextPromise;
}

export async function preloadLlama(onProgress?: (fraction: number) => void) {
  await getLlamaContext(onProgress);
}

<<<<<<< HEAD
export async function cancelDownload() {
  downloadAborted = true;
  if (activeDownload) {
    try {
      await activeDownload.cancelAsync();
    } catch {
      // Ignore cancel errors
    }
    activeDownload = null;
  }
}

=======
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
export async function releaseLlama() {
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
    llamaContextPromise = null;
  }
}
