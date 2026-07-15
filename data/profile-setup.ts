export const profileSetup = [
  {
    id: "name",
    label: "What's your name?",
    type: "input",
    placeholder: "Enter your name",
  },
  {
    id: "phone_number",
    label: "What's your phone number?",
    type: "input",
    placeholder: "Enter your phone number",
  },
  {
    id: "age",
    label: "What's your age?",
    type: "input",
    placeholder: "Enter your age",
  },
  {
    id: "gender",
    label: "What's your gender?",
    type: "options",
    options: [
      { value: "male", label: "Male", points: 0 },
      { value: "female", label: "Female", points: 0 },
    ],
  },
  {
    id: "skin_type",
    label: "What best describes your skin type?",
    type: "options",
    options: [
      { label: "Normal", value: "normal", points: 5 },
      { label: "Combination", value: "combination", points: 4 },
      { label: "Dry", value: "dry", points: 3 },
      { label: "Oily", value: "oily", points: 3 },
      { label: "Sensitive", value: "sensitive", points: 2 },
    ],
  },
  {
    id: "main_concern",
    label: "What is your primary skin concern?",
    type: "options",
    options: [
      { label: "None", value: "none", points: 5 },
      { label: "Pigmentation", value: "pigmentation", points: 3 },
      { label: "Acne", value: "acne", points: 2 },
      { label: "Eczema", value: "eczema", points: 1 },
      { label: "Psoriasis", value: "psoriasis", points: 1 },
    ],
  },
  {
    id: "sleep_quality",
    label: "How many hours do you sleep on average each night?",
    type: "options",
    options: [
      { label: "8–9 hours", value: "excellent", points: 5 },
      { label: "7 hours", value: "good", points: 4 },
      { label: "6 hours", value: "fair", points: 3 },
      { label: "5 hours", value: "poor", points: 2 },
      { label: "Less than 5 hours", value: "very_poor", points: 1 },
    ],
  },
  {
    id: "stress_level",
    label: "How would you rate your daily stress level?",
    type: "options",
    options: [
      { label: "Very Low", value: "very_low", points: 5 },
      { label: "Low", value: "low", points: 4 },
      { label: "Moderate", value: "moderate", points: 3 },
      { label: "High", value: "high", points: 2 },
      { label: "Very High", value: "very_high", points: 1 },
    ],
  },
  {
    id: "water_intake",
    label: "How much water do you drink per day?",
    type: "options",
    options: [
      { label: "More than 2 liters", value: "more_than_2l", points: 5 },
      { label: "1.5–2 liters", value: "1_5_to_2l", points: 4 },
      { label: "1–1.5 liters", value: "1_to_1_5l", points: 3 },
      { label: "500 mL–1 liter", value: "500ml_to_1l", points: 2 },
      { label: "Less than 500 mL", value: "less_than_500ml", points: 1 },
    ],
  },
];
