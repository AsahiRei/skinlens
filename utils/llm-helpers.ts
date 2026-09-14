export function stripThinkTags(raw: string): string {
  let result = raw;

  result = result.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  if (result.includes("<think")) {
    const firstBrace = result.indexOf("{");
    if (firstBrace !== -1) {
      result = result.slice(firstBrace);
    } else {
      result = result
        .replace(/<think[\s\S]*$/i, "")
        .trim();
    }
  }

  return result;
}

export function extractJsonObject(raw: string): string {
  const stripped = stripThinkTags(raw);

  const cleaned = stripped
    .replace(/^```(json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    return match[0];
  }

  const openBrace = cleaned.indexOf("{");
  if (openBrace === -1) {
    throw new Error(
      "No JSON object found in model output: " + raw.slice(0, 200),
    );
  }

  const truncated = cleaned.slice(openBrace);
  return repairJson(truncated);
}

function repairJson(text: string): string {
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
  }

  let result = text;

  if (inString) {
    result += '"';
  }

  while (openBrackets > 0) {
    result += "]";
    openBrackets--;
  }

  while (openBraces > 0) {
    result += "}";
    openBraces--;
  }

  return result;
}
