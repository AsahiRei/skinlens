import * as Device from "expo-device";
import { Platform } from "react-native";

export type DeviceTier = "low" | "mid" | "high";

export type LlamaPerfConfig = {
  tier: DeviceTier;
  n_ctx: number;
  n_threads: number;
  n_batch: number;
  n_ubatch: number;
  n_predict: number;
  use_mlock: boolean;
  top_k: number;
};

const cached: { tier: DeviceTier | null } = { tier: null };

/**
 * Classify the device into a performance tier.
 *
 * Uses expo-device (Expo SDK v57) signals that are available synchronously:
 * - Device.totalMemory (bytes, null on web)
 * - Device.deviceYearClass (null on web)
 *
 * Falls back to "mid" when signals are unavailable so behaviour is unchanged
 * on simulators/web.
 */
export function getDeviceTier(): DeviceTier {
  if (cached.tier) return cached.tier;

  const totalMemory: number | null = Device.totalMemory;
  const yearClass: number | null = Device.deviceYearClass ?? null;

  const GB = 1024 * 1024 * 1024;
  let tier: DeviceTier = "mid";

  if (totalMemory !== null && totalMemory > 0) {
    if (totalMemory <= 3 * GB) tier = "low";
    else if (totalMemory >= 6 * GB) tier = "high";
    else tier = "mid";
  }

  // Year class refines the RAM-only guess: old phones drop a tier,
  // recent flagships rise a tier.
  if (yearClass !== null) {
    if (yearClass <= 2018 && tier !== "low") tier = "low";
    else if (yearClass >= 2023 && totalMemory !== null && totalMemory >= 4 * GB)
      tier = "high";
  }

  // iOS Simulator / Android emulator reports as not-a-device: treat as mid+
  // so dev builds don't get the slowest path.
  if (!Device.isDevice && tier === "low") tier = "mid";

  // Web has no totalMemory: pick by platform as a sane default.
  if (Platform.OS === "web" && cached.tier === null && totalMemory === null) {
    tier = "mid";
  }

  cached.tier = tier;
  return tier;
}

/**
 * Llama.cpp tuning per tier.
 *
 * Rationale:
 * - n_ctx 2048 is plenty: our prompt is ~600-900 tokens, output ~700-1000.
 *   The old 4096 doubled KV-cache memory + prefill cost for no benefit.
 * - n_batch/n_ubatch smaller on low RAM = less peak memory, fewer OOM kills.
 * - n_threads: llama.cpp scales to ~#perf-cores; 4 is a safe default, 6-8
 *   helps modern flagships. Low-end devices throttle with too many threads,
 *   so cap at 3-4.
 * - n_predict: old value 4096 let the model ramble far past the JSON end.
 *   ~1100-1400 tokens fits the full routine; stop tokens cut it earlier.
 */
export function getLlamaPerfConfig(tier?: DeviceTier): LlamaPerfConfig {
  const t = tier ?? getDeviceTier();
  switch (t) {
    case "low":
      return {
        tier: t,
        n_ctx: 2048,
        n_threads: 3,
        n_batch: 256,
        n_ubatch: 128,
        n_predict: 1100,
        use_mlock: false,
        top_k: 30,
      };
    case "high":
      return {
        tier: t,
        n_ctx: 2048,
        n_threads: 6,
        n_batch: 512,
        n_ubatch: 256,
        n_predict: 1400,
        use_mlock: true,
        top_k: 40,
      };
    case "mid":
    default:
      return {
        tier: t,
        n_ctx: 2048,
        n_threads: 4,
        n_batch: 512,
        n_ubatch: 256,
        n_predict: 1300,
        use_mlock: true,
        top_k: 40,
      };
  }
}

/** For tests / previews: reset the cached tier. */
export function __resetDeviceTierCache() {
  cached.tier = null;
}
