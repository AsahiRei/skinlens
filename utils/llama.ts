import * as FileSystem from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { initLlama, type LlamaContext } from "llama.rn";
import { requestNotificationPermissions } from "@/lib/push-notifications";

const MODEL_FILENAME = "Qwen3-0.6B-Q4_K_M.gguf";
const MODEL_URL =
  "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf";

let llamaContext: LlamaContext | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;
let activeDownload: FileSystem.DownloadResumable | null = null;
let downloadAborted = false;
let backgroundNotificationId: string | null = null;

const MAX_RETRIES = 3;

export async function getModelPath(
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const localPath = `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;

  downloadAborted = false;

  let downloadResumable = FileSystem.createDownloadResumable(
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

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (downloadAborted) {
      throw new Error("Download cancelled.");
    }

    try {
      let result;
      if (attempt === 1) {
        result = await downloadResumable.downloadAsync();
      } else {
        result = await downloadResumable.resumeAsync();
      }
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

      if (attempt >= MAX_RETRIES) {
        activeDownload = null;
        throw err;
      }
    }
  }

  activeDownload = null;
  throw new Error("Failed to download the AI model after multiple attempts.");
}

export async function getLlamaContext(
  onModelDownloadProgress?: (fraction: number) => void,
): Promise<LlamaContext> {
  if (llamaContext) return llamaContext;
  if (!llamaContextPromise) {
    llamaContextPromise = (async () => {
      try {
        const modelPath = await getModelPath(onModelDownloadProgress);
        const ctx = await initLlama({
          model: modelPath,
          n_ctx: 2048,
          n_threads: 4,
          n_gpu_layers: 99,
          n_batch: 512,
        });
        llamaContext = ctx;
        return ctx;
      } catch (err) {
        // Clear promise so callers can retry
        llamaContextPromise = null;
        throw err;
      }
    })();
  }
  return llamaContextPromise;
}

export async function preloadLlama(onProgress?: (fraction: number) => void) {
  await getLlamaContext(onProgress);
}

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

async function updateBackgroundNotification(progress: number) {
  if (backgroundNotificationId) {
    await Notifications.dismissNotificationAsync(backgroundNotificationId);
  }

  const content: Notifications.NotificationContentInput = {
    title: "Downloading AI Model",
    data: { type: "model_download" },
  };

  if (Platform.OS === "android") {
    content.body = `Preparing your AI model... ${progress}%`;
    (content as any).progressBar = {
      indeterminate: false,
      max: 100,
      current: progress,
    };
  } else {
    content.body = `Downloading AI model... ${progress}%`;
  }

  backgroundNotificationId = await Notifications.scheduleNotificationAsync({
    content,
    trigger: null,
  });
}

export async function downloadModelWithNotifications(): Promise<void> {
  const granted = await requestNotificationPermissions();
  if (!granted) {
    await getModelPath();
    return;
  }

  await updateBackgroundNotification(0);

  try {
    await getModelPath((fraction) => {
      const pct = Math.round(fraction * 100);
      if (pct % 5 === 0 || pct === 100) {
        updateBackgroundNotification(pct);
      }
    });

    if (backgroundNotificationId) {
      await Notifications.dismissNotificationAsync(backgroundNotificationId);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "AI Model Ready",
        body: "Your AI model has been downloaded successfully.",
        data: { type: "model_download_complete" },
      },
      trigger: null,
    });
  } catch {
    if (backgroundNotificationId) {
      await Notifications.dismissNotificationAsync(backgroundNotificationId);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Download Failed",
        body: "Could not download the AI model. Please try again later.",
        data: { type: "model_download_failed" },
      },
      trigger: null,
    });
  } finally {
    backgroundNotificationId = null;
  }
}

export async function isModelDownloaded(): Promise<boolean> {
  try {
    const localPath = `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
    const info = await FileSystem.getInfoAsync(localPath);
    return info.exists;
  } catch {
    return false;
  }
}

export function stripThinkingTags(text: string): string {
  const openTag = String.fromCharCode(60, 116, 104, 105, 110, 107, 62);
  const closeTag =
    String.fromCharCode(60, 47, 116, 104, 105, 110, 107, 62);
  const lastClose = text.lastIndexOf(closeTag);
  if (lastClose !== -1) {
    return text.slice(lastClose + closeTag.length).trim();
  }
  const firstOpen = text.indexOf(openTag);
  if (firstOpen !== -1) {
    return text.slice(0, firstOpen).trim();
  }
  return text.trim();
}

export async function releaseLlama() {
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
    llamaContextPromise = null;
  }
}
