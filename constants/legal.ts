export type LegalSection = {
  key: string;
  title: string;
  intro?: string;
  blocks?: { label: string; text: string }[];
};

export const TERMS_SECTIONS: LegalSection[] = [
  {
    key: "acceptance",
    title: "1. ACCEPTANCE OF TERMS",
    intro:
      "By downloading and using this mobile application, you agree to be bound by the Terms and Conditions and to our Privacy Policy. If any circumstances that you don't agree to said terms, you can immediately uninstall this mobile application and cease all use.",
  },
  {
    key: "disclaimer",
    title: "2. MEDICAL & PROFESSIONAL DISCLAIMER",
    blocks: [
      {
        label: "Application Detects Facial Skin Problems:",
        text: "Our AI-powered mobile application for facial skin detection only provides information about user's skin. This mobile application doesn't comprehend any information that is not related to facial skin problems. The application's purpose was for educational and informational only.",
      },
      {
        label: "Consult a Dermatologist:",
        text: "This application don't diagnose a skin problem to the user. Its intended purpose is to detect facial skin conditions and give simple recommendations to the users. It is still better to seek to a medical professional like dermatologist regarding to the facial skin problems.",
      },
    ],
  },
  {
    key: "eligibility",
    title: "3. ACCOUNT ELIGIBILITY & USER GUIDELINES",
    blocks: [
      {
        label: "Age Eligibility:",
        text: "This application is only allowed to be used by users whose ages were 20 and above.",
      },
      {
        label: "Account Security:",
        text: "You are responsible for maintaining the confidentially of your account's credentials and fully responsible to the all activites occured under your account.",
      },
      {
        label: "Accurate Information:",
        text: "You are agree to provide your accurate and true credentials like name, age, birthday, and to the profiling (recent facial skin problems you have).",
      },
    ],
  },
  {
    key: "ai-limitations",
    title: "4. AI LIMITATIONS & INDIVIDUAL RESULTS",
    blocks: [
      {
        label: "Accuracy:",
        text: "While our application is an AI-powered, there as still limitations could affect the accurateness of mobile application. Such as external factors like camera quality, lighting, and image resolution could affect the accuracy of detection of facial skin problems.",
      },
      {
        label: "Individual Results:",
        text: "The results of facial skin detection are not guaranteed. It could vary depends on individual genetics, environmental factors, hormones, or to their daily routine.",
      },
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    key: "data-privacy",
    title: "1. DATA PRIVACY & DATA HANDLING",
    blocks: [
      {
        label: "Image Processing:",
        text: "By uploading your photos of facial skin, you are giving the mobile application the consent to process the image for the sole purpose of analyzing facial skin conditions and generating of personalized routine.",
      },
      {
        label: "Data Protection:",
        text: "The mobile application adheres to the Data Privacy Act of 2012 (RA 10173) law of the Philippines. We assure you that the data you provided will be stored safely.",
      },
      {
        label: "Purpose of Collection:",
        text: "We collect personal information including name, age, and skin images to provide a personalized skin analysis and recommendations. This data is used exclusively for the functioning of the application's AI analysis.",
      },
      {
        label: "Third Party Disclosure:",
        text: "We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties unless required by law.",
      },
    ],
  },
  {
    key: "user-rights",
    title: "2. USER RIGHTS",
    blocks: [
      {
        label: "Access and Correction:",
        text: "Users have the right to access their personal data and request corrections to any inaccurate information stored in their profile.",
      },
      {
        label: "Data Deletion:",
        text: "Users may request the deletion of their account and all associated personal data at any time through the application settings or by contacting support.",
      },
    ],
  },
];
