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
  const prompt = `
    You are SkinLens AI, a skincare guidance assistant.
    Your task is to create a simple and personalized skincare routine based on the user's skin profile, main concern, lifestyle, and health score.

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
    Return valid JSON only.
    Do not include Markdown, code fences, or any text outside the JSON.
    The format should stay what it was

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
  const response = await fetch(
    `${process.env.EXPO_PUBLIC_OLLAMA_URL}/api/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3.2:1b",
        prompt,
        stream: false,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }
  const text = await response.text();
  const data = JSON.parse(text);
  console.log("OLLAMA DATA:", data);
  console.log("OLLAMA RESPONSE:", data.response);
  return data.response;
}
