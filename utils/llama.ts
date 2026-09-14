import * as FileSystem from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { initLlama, type LlamaContext } from "llama.rn";
import { requestNotificationPermissions } from "@/lib/push-notifications";

type ModelConfig = {
  filename: string;
  url: string;
  label: string;
  n_ctx: number;
  n_threads: number;
};

const MODEL: ModelConfig = {
  filename: "Qwen3-0.6B-Q4_K_M.gguf",
  url: "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf",
  label: "Qwen3 0.6B",
  n_ctx: 4096,
  n_threads: 4,
};

export async function getSelectedModel(): Promise<ModelConfig> {
  return MODEL;
}

let llamaContext: LlamaContext | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;
let activeDownload: FileSystem.DownloadResumable | null = null;
let downloadAborted = false;
let backgroundNotificationId: string | null = null;

const MAX_RETRIES = 3;

export async function getModelPath(
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const model = MODEL;
  const localPath = `${FileSystem.documentDirectory}${model.filename}`;
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;

  downloadAborted = false;

  let downloadResumable = FileSystem.createDownloadResumable(
    model.url,
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
          n_ctx: MODEL.n_ctx,
          n_threads: MODEL.n_threads,
          n_gpu_layers: 99,
          n_batch: 512,
          n_ubatch: 512,
          use_mlock: true,
          flash_attn_type: "auto",
          cache_type_k: "q8_0",
          cache_type_v: "q8_0",
        });
        llamaContext = ctx;
        return ctx;
      } catch (err) {
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
    const localPath = `${FileSystem.documentDirectory}${MODEL.filename}`;
    const info = await FileSystem.getInfoAsync(localPath);
    return info.exists;
  } catch {
    return false;
  }
}

export async function releaseLlama() {
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
    llamaContextPromise = null;
  }
}
