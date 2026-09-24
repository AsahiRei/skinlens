import * as FileSystem from "expo-file-system/legacy";
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

let llamaContext: LlamaContext | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;
let activeDownload: FileSystem.DownloadResumable | null = null;
let downloadAborted = false;

const MAX_RETRIES = 3;

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

export async function getModelPath(
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const model = MODEL;
  const localPath = `${FileSystem.documentDirectory}${model.filename}`;
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists && !info.isDirectory && info.size >= MIN_MODEL_BYTES) {
    return localPath;
  }
  if (info.exists) {
    console.warn(
      `[llama] model file suspicious (size=${info.isDirectory ? "dir" : (info as { size?: number }).size ?? "?"} bytes), deleting and re-downloading fresh.`,
    );
    try {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    } catch {
      // fall through to download attempt
    }
  }

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
        const bytes = await getModelBytes();
        console.log(`[llama] model download finished: ${bytes} bytes`);
        if (bytes >= 0 && bytes < MIN_MODEL_BYTES) {
          try {
            await FileSystem.deleteAsync(localPath, { idempotent: true });
          } catch {
            // ignore cleanup errors
          }
          throw new Error(
            `Downloaded model is incomplete (${bytes} bytes, expected >= ${MIN_MODEL_BYTES}).`,
          );
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

export async function getLlamaContext(
  onModelDownloadProgress?: (fraction: number) => void,
): Promise<LlamaContext> {
  if (llamaContext) return llamaContext;
  if (!llamaContextPromise) {
    llamaContextPromise = (async () => {
      try {
        const tier = getDeviceTier();
        const perf = getLlamaPerfConfig(tier);
        const modelPath = await getModelPath(onModelDownloadProgress);
        console.log(
          `[llama] init tier=${tier} n_ctx=${perf.n_ctx} threads=${perf.n_threads} batch=${perf.n_batch}/${perf.n_ubatch} mlock=${perf.use_mlock} model=${modelPath}`,
        );
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

export async function preloadLlama(onProgress?: (fraction: number) => void) {
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
    try {
      await activeDownload.cancelAsync();
    } catch {
      // Ignore cancel errors
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
