import { initLlama, type LlamaContext } from "llama.rn";
import * as FileSystem from "expo-file-system/legacy";

const MODEL_FILENAME = "Llama-3.2-1B-Instruct-Q4_K_M.gguf";
const MODEL_URL =
  "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf";

let llamaContext: LlamaContext | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;

const JSON_GRAMMAR = `
root   ::= object
object ::= "{" ws members ws "}"
members ::= member ("," ws member)*
member ::= string ws ":" ws value
value  ::= object | array | string | number | ("true" | "false" | "null")
array  ::= "[" ws (value ("," ws value)*)? ws "]"
string ::= "\\"" ([^"\\\\] | "\\\\" .)* "\\""
number ::= "-"? [0-9]+ ("." [0-9]+)?
ws     ::= [ \\t\\n]*
`;

async function getModelPath(
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

async function getLlamaContext(
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
      });
      llamaContext = ctx;
      return ctx;
    })();
  }
  return llamaContextPromise;
}

function extractJsonObject(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      "No JSON object found in model output: " + raw.slice(0, 200),
    );
  }
  return match[0];
}

export async function generateRoutine({
  skin_type,
  main_concern,
  sleep_quality,
  stress_level,
  water_intake,
  health_score,
}: {
  skin_type: string;
  main_concern: string;
  sleep_quality: string;
  stress_level: string;
  water_intake: string;
  health_score: number;
}) {
  const systemPrompt = `You are SkinLens AI, a skincare guidance assistant. You always respond with valid JSON only — no Markdown, no code fences, no commentary before or after the JSON.`;
  const userPrompt = `
    Create a simple and personalized skincare routine based on the user's skin profile, main concern, lifestyle, and health score.
    USER INFORMATION:
    - Skin Type: ${skin_type}
    - Main Skin Concern: ${main_concern}
    - Sleep Quality: ${sleep_quality}
    - Stress Level: ${stress_level}
    - Water Intake: ${water_intake}
    - Health Score: ${health_score}%

    INSTRUCTIONS:
    1. Create a personalized skincare routine suitable for the user's skin type and main concern.
    2. Consider the user's sleep quality, stress level, and water intake when making recommendations.
    3. Keep the routine simple and beginner-friendly.
    4. Create exactly three routines:
    - Morning Routine
    - Afternoon Routine
    - Evening Routine
    5. Recommend suitable skincare product TYPES for each routine.
    6. Also provide a separate list of recommended products.
    7. Do not recommend prescription medications.
    8. Do not diagnose or claim to cure a skin condition.
    9. Avoid recommending too many products.
    10. Prioritize gentle, practical, and commonly available skincare products.
    11. Include sunscreen in the morning routine when appropriate.
    12. Keep explanations short and easy to understand.
    13. If the user's skin concern appears serious or persistent, advise them to consult a dermatologist.

    OUTPUT FORMAT:
    Return valid JSON only, matching this exact shape:

    {
    "summary": "Short personalized summary of the user's skin condition and needs.",

    "morning_routine": [
        {
          "step": 1,
          "product_type": "Gentle Cleanser",
          "instruction": "Gently cleanse your face...",
          "reason": "Removes dirt and excess oil."
        },
        {
          "step": 2,
          "product_type": "Moisturizer",
          "instruction": "Apply a lightweight moisturizer...",
          "reason": "Helps maintain the skin barrier."
        },
        {
          "step": 3,
          "product_type": "Sunscreen",
          "instruction": "Apply broad-spectrum SPF 30 or higher...",
          "reason": "Helps protect the skin from UV damage."
        }
    ],

    "afternoon_routine": [
        {
          "step": 1,
          "product_type": "Sunscreen",
          "instruction": "Reapply sunscreen when needed...",
          "reason": "Maintains sun protection throughout the day."
        }
    ],

    "evening_routine": [
        {
          "step": 1,
          "product_type": "Gentle Cleanser",
          "instruction": "Cleanse your face...",
          "reason": "Removes sunscreen, dirt, and impurities."
        },
        {
          "step": 2,
          "product_type": "Treatment",
          "instruction": "Use an appropriate gentle treatment...",
          "reason": "Targets the user's main skin concern."
        },
        {
          "step": 3,
          "product_type": "Moisturizer",
          "instruction": "Apply moisturizer...",
          "reason": "Supports the skin barrier overnight."
        }
    ],

    "recommended_products": [
        {
          "product_type": "Gentle Cleanser",
          "recommended_ingredients": ["..."],
          "reason": "..."
        },
        {
          "product_type": "Moisturizer",
          "recommended_ingredients": ["..."],
          "reason": "..."
        },
        {
          "product_type": "Sunscreen",
          "recommended_ingredients": ["..."],
          "reason": "..."
        }
    ]
    }
  `;

  const context = await getLlamaContext();
  const { text } = await context.completion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    n_predict: 1024,
    temperature: 0.4,
    top_p: 0.9,
    grammar: JSON_GRAMMAR,
    stop: ["</s>", "<|eot_id|>", "<|end_of_text|>"],
  });
  console.log("LLAMA.RN RESPONSE:", text);
  return extractJsonObject(text);
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