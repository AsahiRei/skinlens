import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { File, FileMode } from "expo-file-system";
import { initLlama, type LlamaContext } from "llama.rn";
import { getDeviceTier, getLlamaPerfConfig } from "./device-perf";

type ModelConfig = {
  filename: string;
  url: string;
  label: string;
};

const MODEL: ModelConfig = {
  filename: "Qwen3-0.6B-Q4_K_M.gguf",
  url: "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf",
  label: "Qwen3 0.6B",
};

export async function getSelectedModel(): Promise<ModelConfig> {
  return MODEL;
}

export type ModelDownloadProgress = (
  fraction: number,
  bytesWritten?: number,
  totalBytes?: number,
) => void;

let llamaContext: LlamaContext | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;
let activeDownload: FileSystem.DownloadResumable | null = null;
let downloadAborted = false;

const MAX_RETRIES = 3;

/**
 * Persistent download cache (AsyncStorage) so a model download survives
 * app restarts / kills. We persist:
 * - bytesWritten + totalBytes (to seed progress UI and know the exact
 *   expected size instead of guessing), and
 * - the native `savable()` pause state (resumeData) when available.
 *
 * On the next launch, a partial file is resumed — never deleted and
 * restarted from zero.
 */
const DOWNLOAD_STATE_KEY = "skinlens:model-download-state:v1";
const RESUME_STATE_KEY = "skinlens:model-resume-state:v1";

type PersistedDownloadState = {
  filename: string;
  bytesWritten: number;
  totalBytes: number;
  updatedAt: number;
};

type PersistedResumeState = {
  url: string;
  fileUri: string;
  options?: Record<string, unknown>;
  resumeData?: string;
};

let lastPersistAt = 0;
let lastPersistedBytes = -1;

async function loadPersistedDownloadState(): Promise<PersistedDownloadState | null> {
  try {
    const raw = await AsyncStorage.getItem(DOWNLOAD_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDownloadState;
    if (parsed.filename !== MODEL.filename) return null;
    if (!Number.isFinite(parsed.bytesWritten) || !Number.isFinite(parsed.totalBytes)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function shouldPersist(bytesWritten: number): boolean {
  const now = Date.now();
  if (now - lastPersistAt > 2000) return true;
  if (Math.abs(bytesWritten - lastPersistedBytes) >= 1024 * 1024) return true;
  return false;
}

async function savePersistedDownloadState(
  bytesWritten: number,
  totalBytes: number,
  force = false,
): Promise<void> {
  if (!force && !shouldPersist(bytesWritten)) return;
  lastPersistAt = Date.now();
  lastPersistedBytes = bytesWritten;
  try {
    const state: PersistedDownloadState = {
      filename: MODEL.filename,
      bytesWritten,
      totalBytes,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(DOWNLOAD_STATE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is best-effort; the download itself must not fail.
  }
}

async function clearPersistedDownloadState(): Promise<void> {
  lastPersistAt = 0;
  lastPersistedBytes = -1;
  try {
    await AsyncStorage.removeItem(DOWNLOAD_STATE_KEY);
  } catch {
    // ignore
  }
}

async function loadResumeState(): Promise<PersistedResumeState | null> {
  try {
    const raw = await AsyncStorage.getItem(RESUME_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedResumeState;
    if (parsed.url !== MODEL.url) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveResumeState(
  state: PersistedResumeState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(RESUME_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

async function clearResumeState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RESUME_STATE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Qwen3-0.6B Q4_K_M is ~340-400MB on disk. Anything far below that is a
 * truncated/corrupt download, which loads but generates empty output.
 */
const MIN_MODEL_BYTES = 250 * 1024 * 1024;

export async function getModelBytes(): Promise<number> {
  try {
    const localPath = `${FileSystem.documentDirectory}${MODEL.filename}`;
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists && !info.isDirectory) return info.size;
  } catch {
    // ignore — reported as -1
  }
  return -1;
}

/**
 * Current on-disk progress vs the exact expected model size.
 * Used to seed progress UI on cold start (e.g. "142 / 402 MB, 35%")
 * instead of resetting to 0% after the app was closed mid-download.
 */
export async function getModelDownloadState(): Promise<{
  bytesWritten: number;
  totalBytes: number;
  fraction: number;
}> {
  const onDisk = await getModelBytes();
  const persisted = await loadPersistedDownloadState();
  const totalBytes = persisted?.totalBytes && persisted.totalBytes > 0 ? persisted.totalBytes : -1;
  const bytesWritten = Math.max(
    onDisk > 0 ? onDisk : 0,
    persisted?.bytesWritten && persisted.bytesWritten > 0 ? persisted.bytesWritten : 0,
  );
  const fraction =
    totalBytes > 0 && bytesWritten > 0 ? Math.min(1, bytesWritten / totalBytes) : 0;
  return { bytesWritten, totalBytes, fraction };
}

function isComplete(sizeBytes: number, expectedTotal: number | null): boolean {
  if (expectedTotal !== null && expectedTotal > 0) {
    return sizeBytes >= expectedTotal;
  }
  return sizeBytes >= MIN_MODEL_BYTES;
}

async function getFileSizeOrThrow(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && !info.isDirectory) return info.size;
  throw new Error("Downloaded part file is missing.");
}

/**
 * Append the remainder file (`partUri`) to the end of the partial model
 * file (`mainUri`) in fixed-size chunks so a ~400MB merge never holds
 * the whole file in JS memory.
 */
function appendPartToMain(partUri: string, mainUri: string): void {
  const CHUNK_BYTES = 4 * 1024 * 1024;
  const part = new File(partUri);
  const main = new File(mainUri);
  const readHandle = part.open(FileMode.ReadOnly);
  const writeHandle = main.open(FileMode.ReadWrite);
  try {
    const total = readHandle.size ?? part.size;
    if (!total || total <= 0) {
      throw new Error("Downloaded part file is empty.");
    }
    writeHandle.offset = writeHandle.size;
    let remaining = total;
    while (remaining > 0) {
      const next = Math.min(CHUNK_BYTES, remaining);
      const bytes = readHandle.readBytes(next);
      if (bytes.length === 0) break;
      writeHandle.writeBytes(bytes);
      remaining -= bytes.length;
    }
    if (remaining > 0) {
      throw new Error("Failed to merge downloaded part file.");
    }
  } finally {
    try {
      readHandle.close();
    } catch {
      // ignore
    }
    try {
      writeHandle.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Resume a partial download with an HTTP Range request for the missing
 * tail (`bytes=<onDisk>-`), downloaded to a sidecar `.part` file and then
 * appended to the partial file. Returns the final model uri, or null when
 * a resume is not possible (no known offset / server ignores Range) so the
 * caller can fall back to a fresh download.
 */
async function tryRangeResume(
  localPath: string,
  onDiskBytes: number,
  knownTotal: number | null,
  onProgress?: ModelDownloadProgress,
): Promise<string | null> {
  if (onDiskBytes <= 0) return null;
  const partPath = `${localPath}.part`;
  try {
    await FileSystem.deleteAsync(partPath, { idempotent: true });
  } catch {
    // ignore cleanup errors
  }

  let remainderExpected = -1;
  let resumable: FileSystem.DownloadResumable | null = null;
  try {
    resumable = FileSystem.createDownloadResumable(
      MODEL.url,
      partPath,
      { headers: { Range: `bytes=${onDiskBytes}-` } },
      (progress) => {
        if (downloadAborted) return;
        if (progress.totalBytesExpectedToWrite > 0) {
          remainderExpected = progress.totalBytesExpectedToWrite;
          const total = knownTotal ?? onDiskBytes + remainderExpected;
          const overall = Math.min(
            onDiskBytes + progress.totalBytesWritten,
            total,
          );
          void savePersistedDownloadState(overall, total);
          onProgress?.(total > 0 ? overall / total : 0, overall, total);
        }
      },
    );
    activeDownload = resumable;
    const result = await resumable.downloadAsync();
    if (downloadAborted || !result?.uri) return null;

    const status = result.status ?? 0;
    const partSize = await getFileSizeOrThrow(partPath);
    if (partSize <= 0) return null;

    if (status === 206 || (knownTotal !== null && onDiskBytes + partSize <= knownTotal + 1024)) {
      // Usual case: server honoured Range, part holds exactly the tail.
      appendPartToMain(partPath, localPath);
      const finalSize = await getModelBytes();
      const total = knownTotal ?? onDiskBytes + remainderExpected;
      if (total > 0) {
        void savePersistedDownloadState(finalSize, total, true);
        onProgress?.(Math.min(1, finalSize / total), finalSize, total);
      }
      try {
        await FileSystem.deleteAsync(partPath, { idempotent: true });
      } catch {
        // ignore
      }
      activeDownload = null;
      return localPath;
    }

    if (status === 200) {
      // Server ignored Range and sent the whole file into the part file.
      // Replace the stale partial with the complete download.
      try {
        await FileSystem.deleteAsync(localPath, { idempotent: true });
      } catch {
        // ignore
      }
      await FileSystem.moveAsync({ from: partPath, to: localPath });
      activeDownload = null;
      return localPath;
    }

    return null;
  } catch {
    return null;
  } finally {
    if (activeDownload === resumable) activeDownload = null;
  }
}

async function tryResumeFromPauseState(
  localPath: string,
  onProgress?: ModelDownloadProgress,
): Promise<string | null> {
  const saved = await loadResumeState();
  if (!saved?.resumeData || saved.fileUri !== localPath) return null;
  const resumable = FileSystem.createDownloadResumable(
    saved.url,
    saved.fileUri,
    (saved.options as unknown as NonNullable<
      Parameters<typeof FileSystem.createDownloadResumable>[2]
    >) ?? {},
    (progress) => {
      if (downloadAborted) return;
      if (progress.totalBytesExpectedToWrite > 0) {
        void savePersistedDownloadState(
          progress.totalBytesWritten,
          progress.totalBytesExpectedToWrite,
        );
        onProgress?.(
          progress.totalBytesWritten / progress.totalBytesExpectedToWrite,
          progress.totalBytesWritten,
          progress.totalBytesExpectedToWrite,
        );
      }
    },
    saved.resumeData,
  );
  activeDownload = resumable;
  try {
    const result = await resumable.resumeAsync();
    if (downloadAborted || !result?.uri) return null;
    activeDownload = null;
    return result.uri;
  } catch {
    activeDownload = null;
    return null;
  }
}

async function runFreshDownload(
  localPath: string,
  onProgress?: ModelDownloadProgress,
): Promise<string> {
  downloadAborted = false;

  let downloadResumable = FileSystem.createDownloadResumable(
    MODEL.url,
    localPath,
    {},
    (progress) => {
      if (downloadAborted) return;
      if (onProgress && progress.totalBytesExpectedToWrite > 0) {
        void savePersistedDownloadState(
          progress.totalBytesWritten,
          progress.totalBytesExpectedToWrite,
        );
        onProgress(
          progress.totalBytesWritten / progress.totalBytesExpectedToWrite,
          progress.totalBytesWritten,
          progress.totalBytesExpectedToWrite,
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
        const bytes = await getModelBytes();
        if (__DEV__) {
          console.log(`[llama] model download finished: ${bytes} bytes`);
        }
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

export async function getModelPath(
  onProgress?: ModelDownloadProgress,
): Promise<string> {
  const model = MODEL;
  const localPath = `${FileSystem.documentDirectory}${model.filename}`;

  // Drop a stale sidecar remainder from a killed Range-resume; the main
  // partial file is kept and resumed below.
  try {
    await FileSystem.deleteAsync(`${localPath}.part`, { idempotent: true });
  } catch {
    // ignore
  }

  const persisted = await loadPersistedDownloadState();
  const knownTotal =
    persisted && persisted.totalBytes > 0 ? persisted.totalBytes : null;

  const info = await FileSystem.getInfoAsync(localPath);
  const onDiskBytes =
    info.exists && !info.isDirectory ? info.size : 0;
  if (info.exists && info.isDirectory) {
    // A directory at the model path can never be valid — remove it.
    try {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    } catch {
      // fall through to download attempt
    }
  } else if (onDiskBytes > 0) {
    if (isComplete(onDiskBytes, knownTotal)) {
      await clearPersistedDownloadState();
      await clearResumeState();
      if (knownTotal !== null) {
        onProgress?.(1, onDiskBytes, knownTotal);
      }
      return localPath;
    }

    // Seed the UI with the cached exact-size progress (e.g. 142/402 MB)
    // instead of jumping from 0%.
    if (knownTotal !== null) {
      const cached = persisted?.bytesWritten ?? 0;
      const written = Math.max(onDiskBytes, cached);
      onProgress?.(Math.min(1, written / knownTotal), written, knownTotal);
    }

    // 1) Resume via the persisted native pause state (fast path when the
    // previous run paused cleanly).
    const resumed = await tryResumeFromPauseState(localPath, onProgress);
    if (resumed) {
      const bytes = await getModelBytes();
      const totalAfter = (await loadPersistedDownloadState())?.totalBytes ?? knownTotal;
      if (isComplete(bytes, totalAfter)) {
        await clearPersistedDownloadState();
        await clearResumeState();
        onProgress?.(1, bytes, totalAfter ?? bytes);
        return resumed;
      }
      // Pause-state resume made progress but did not finish (cancelled);
      // surface the cancellation so the UI stays in a retryable state.
      if (downloadAborted) throw new Error("Download cancelled.");
    }
    if (downloadAborted) throw new Error("Download cancelled.");

    // 2) Resume via HTTP Range using the exact on-disk byte count.
    // This covers the "app was killed" case where no resumeData exists.
    const ranged = await tryRangeResume(localPath, onDiskBytes, knownTotal, onProgress);
    if (ranged) {
      const bytes = await getModelBytes();
      const totalAfter = (await loadPersistedDownloadState())?.totalBytes ?? knownTotal;
      if (isComplete(bytes, totalAfter)) {
        await clearPersistedDownloadState();
        await clearResumeState();
        onProgress?.(1, bytes, totalAfter ?? bytes);
        return ranged;
      }
      if (bytes > onDiskBytes) {
        // Tail was appended but the file still isn't complete (connection
        // dropped mid-tail). Loop back around: the next call resumes the
        // new tail instead of restarting.
        return getModelPath(onProgress);
      }
    }
    if (downloadAborted) throw new Error("Download cancelled.");
    // Fell through: Range unsupported or failed — fresh download below.
    // IMPORTANT: the partial file is kept (not deleted); a full download
    // overwrites it only once the fresh transfer succeeds.
  }

  downloadAborted = false;

  const uri = await runFreshDownload(localPath, onProgress);
  const bytes = await getModelBytes();
  const totalAfter = (await loadPersistedDownloadState())?.totalBytes ?? null;
  if (bytes >= 0 && !isComplete(bytes, totalAfter)) {
    try {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    } catch {
      // ignore cleanup errors
    }
    await clearPersistedDownloadState();
    throw new Error(
      `Downloaded model is incomplete (${bytes} bytes, expected >= ${totalAfter ?? MIN_MODEL_BYTES}).`,
    );
  }
  await clearPersistedDownloadState();
  await clearResumeState();
  if (totalAfter !== null) onProgress?.(1, bytes, totalAfter);
  return uri;
}

export async function getLlamaContext(
  onModelDownloadProgress?: ModelDownloadProgress,
): Promise<LlamaContext> {
  if (llamaContext) return llamaContext;
  if (!llamaContextPromise) {
    llamaContextPromise = (async () => {
      try {
        const tier = getDeviceTier();
        const perf = getLlamaPerfConfig(tier);
        const modelPath = await getModelPath(onModelDownloadProgress);
        if (__DEV__) {
          console.log(
            `[llama] init tier=${tier} n_ctx=${perf.n_ctx} threads=${perf.n_threads} batch=${perf.n_batch}/${perf.n_ubatch} mlock=${perf.use_mlock} model=${modelPath}`,
          );
        }
        const ctx = await initLlama({
          model: modelPath,
          n_ctx: perf.n_ctx,
          n_threads: perf.n_threads,
          n_gpu_layers: 99,
          n_batch: perf.n_batch,
          n_ubatch: perf.n_ubatch,
          use_mlock: perf.use_mlock,
          // Skip memory-hungry weight repacking buffers on low-end devices.
          no_extra_bufts: perf.tier === "low",
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

/**
 * Serialize all completions on the shared context.
 *
 * llama.rn holds a single sequence slot by default — two overlapping
 * `completion()` calls corrupt each other and one side comes back empty
 * (surfacing as "No JSON object found in model output"). Every caller
 * must route generations through this queue.
 */
let completionTail: Promise<void> = Promise.resolve();

export async function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const previous = completionTail;
  let release: () => void = () => {};
  completionTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

/** Warm the model with a tiny prompt so the first real generation is fast. */
export async function warmupLlama(): Promise<void> {
  const ctx = await getLlamaContext();
  try {
    await runExclusive(() =>
      ctx.completion({
        prompt: "OK",
        n_predict: 1,
        temperature: 0,
      }),
    );
  } catch {
    // Warmup is best-effort; real generation will surface real errors.
  }
}

export async function preloadLlama(onProgress?: ModelDownloadProgress) {
  await getLlamaContext(onProgress);
  // Awaited (not fire-and-forget): a background warmup completion would
  // race the first real generation on the shared context and empty it.
  // Cost is ~1 token, paid while the progress UI is still visible.
  await warmupLlama();
}

export type LlamaDiagnosis = {
  ok: boolean;
  tier: string;
  modelBytes: number;
  textLength: number;
  contentLength: number;
  reasoningLength: number;
  tokensPredicted: number;
  tokensEvaluated: number;
  stoppedEos: boolean;
  stoppedWord: string;
  truncated: boolean;
  contextFull: boolean;
  promptMs: number;
  predictedMs: number;
  error?: string;
};

/**
 * Minimal probe generation used to tell apart:
 * - corrupt/truncated model (probe also empty),
 * - instant-EOS/template problem (tokensPredicted ~0, stoppedEos),
 * - context overflow (contextFull),
 * - reasoning swallowing the answer (reasoningLength > 0, text empty).
 */
export async function diagnoseLlama(): Promise<LlamaDiagnosis> {
  const tier = getDeviceTier();
  const modelBytes = await getModelBytes();
  const base = {
    tier,
    modelBytes,
    textLength: 0,
    contentLength: 0,
    reasoningLength: 0,
    tokensPredicted: 0,
    tokensEvaluated: 0,
    stoppedEos: false,
    stoppedWord: "",
    truncated: false,
    contextFull: false,
    promptMs: 0,
    predictedMs: 0,
  };
  try {
    const ctx = await getLlamaContext();
    const res = await runExclusive(() =>
      ctx.completion({
        messages: [{ role: "user", content: "Reply with exactly: hi" }],
        n_predict: 16,
        temperature: 0.3,
      }),
    );
    return {
      ...base,
      ok: true,
      textLength: res.text?.length ?? 0,
      contentLength: res.content?.length ?? 0,
      reasoningLength: res.reasoning_content?.length ?? 0,
      tokensPredicted: res.tokens_predicted ?? 0,
      tokensEvaluated: res.tokens_evaluated ?? 0,
      stoppedEos: res.stopped_eos ?? false,
      stoppedWord: res.stopped_word ?? "",
      truncated: res.truncated ?? false,
      contextFull: res.context_full ?? false,
      promptMs: res.timings?.prompt_ms ?? 0,
      predictedMs: res.timings?.predicted_ms ?? 0,
    };
  } catch (e) {
    return {
      ...base,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function cancelDownload() {
  downloadAborted = true;
  if (activeDownload) {
    // Prefer a clean pause so the native resumeData can be persisted to
    // AsyncStorage: the next launch resumes instead of restarting.
    // Fall back to a hard cancel when pausing isn't possible.
    try {
      const pauseState = await activeDownload.pauseAsync();
      await saveResumeState({
        url: pauseState.url,
        fileUri: pauseState.fileUri,
        options: pauseState.options as unknown as Record<string, unknown>,
        resumeData: pauseState.resumeData,
      });
    } catch {
      try {
        await activeDownload.cancelAsync();
      } catch {
        // Ignore cancel errors
      }
    }
    activeDownload = null;
  }
}

export async function releaseLlama() {
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
    llamaContextPromise = null;
  }
}
