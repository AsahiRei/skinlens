import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as ExpoCrypto from "expo-crypto";

if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: (array: any) => ExpoCrypto.getRandomValues(array),
    subtle: {
      digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        const algo =
          typeof algorithm === "string"
            ? algorithm
            : (algorithm as any).name;
        if (algo !== "SHA-256") {
          throw new Error(`Unsupported algorithm: ${algo}`);
        }
        const bytes =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, bytes);
      },
    },
  } as any;
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
);
