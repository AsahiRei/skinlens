export type RoutineContext = {
  skin_type: string;
  main_concern: string;
  sleep_quality: string;
  stress_level: string;
  water_intake: string;
  prediction: string;
  confidence: number;
  health_score: number;
};

export function generateRoutineContextPrompt(context: RoutineContext): string {
  return `
    You are a professional dermatologist and skincare specialist.
    Your task is to generate a personalized skincare routine based on the user's skin profile, lifestyle, and latest skin scan.

    ## Skin Profile
    Skin Type: ${context.skin_type}
    Main Concern: ${context.main_concern}

    ## Lifestyle
    Sleep Quality: ${context.sleep_quality}
    Stress Level: ${context.stress_level}
    Water Intake: ${context.water_intake}

    ## Latest Skin Scan
    Prediction: ${context.prediction}
    Confidence: ${context.confidence}
    Health Score: ${context.health_score}

    ## Instructions
    Generate a skincare routine for:
    - Morning
    - Afternoon
    - Evening

    Each routine should contain 3–6 practical skincare steps.

    Use evidence-based skincare recommendations.

    Recommend products by ingredient instead of specific brands unless necessary.

    Adjust the routine according to:
    - Skin type
    - Main concern
    - Lifestyle
    - AI prediction
    - Health score

    Also provide 3–5 lifestyle tips that can improve skin health.

    If the health score is below 50, create a gentle recovery routine.

    If the prediction indicates acne, avoid recommending harsh exfoliation every day.

    If the prediction indicates eczema or dry skin, prioritize repairing the skin barrier.

    If the prediction indicates oily skin, focus on oil control while maintaining hydration.

    If the prediction is normal skin, provide a simple maintenance routine.

    ## Rules
    - Do not recommend prescription medications.
    - Do not recommend products containing ingredients that conflict with the user's skin condition.
    - Keep each task short (maximum 20 words).
    - Explain each reason in one sentence.
    - Return ONLY valid JSON.
    - Do not wrap the JSON in markdown or code fences.

    ## Output

    {
    "source": "ai",
        "morning": [
            {
                "task": "",
                "reason": ""
            }
        ],
        "afternoon": [
            {
                "task": "",
                "reason": ""
            }
        ],
        "evening": [
            {
                "task": "",
                "reason": ""
            }
        ],
        "tips": [
            ""
        ]
    }
  `;
}
