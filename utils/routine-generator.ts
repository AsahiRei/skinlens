import {
  RoutineContext,
  generateRoutineContextPrompt,
} from "@/prompts/generate-routine-context";

export async function generateRoutine(context: RoutineContext) {
  const routine = await fetch(process.env.EXPO_PUBLIC_OLLAMA_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama3.2:1b",
      stream: false,
      prompt: generateRoutineContextPrompt(context),
      format: "json",
    }),
  });
  const result = await routine.json();
  if (!routine.ok) {
    throw new Error(result.error);
  }
  return JSON.parse(result.response);
}
