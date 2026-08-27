import { useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import PagerView from "react-native-pager-view";
import Ionicons from "@react-native-vector-icons/ionicons";

import InlineProgress from "@/components/InlineProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";

const detectionQuestions: Record<
  string,
  {
    id: string;
    label: string;
    options: { value: string; label: string; points: number; icon: string }[];
  }[]
> = {
  acne: [
    {
      id: "duration",
      label: "How long have you had acne?",
      options: [
        { value: "less_than_1_month", label: "Less than a month", points: 4, icon: "time-outline" },
        { value: "1_to_3_months", label: "1–3 months", points: 3, icon: "time-outline" },
        { value: "3_to_6_months", label: "3–6 months", points: 2, icon: "time-outline" },
        { value: "more_than_6_months", label: "More than 6 months", points: 1, icon: "time-outline" },
      ],
    },
    {
      id: "severity",
      label: "How severe would you rate your acne?",
      options: [
        { value: "mild", label: "Mild (a few spots)", points: 4, icon: "eye-outline" },
        { value: "moderate", label: "Moderate (several spots)", points: 2, icon: "eye-outline" },
        { value: "severe", label: "Severe (widespread, painful)", points: 1, icon: "eye-outline" },
      ],
    },
    {
      id: "area",
      label: "Where is the acne mainly located?",
      options: [
        { value: "forehead", label: "Forehead", points: 3, icon: "person-outline" },
        { value: "cheeks", label: "Cheeks", points: 3, icon: "person-outline" },
        { value: "chin", label: "Chin / Jawline", points: 3, icon: "person-outline" },
        { value: "all_over", label: "All over the face", points: 1, icon: "person-outline" },
      ],
    },
  ],
  eczema: [
    {
      id: "duration",
      label: "How long have you had eczema?",
      options: [
        { value: "less_than_1_month", label: "Less than a month", points: 4, icon: "time-outline" },
        { value: "1_to_3_months", label: "1–3 months", points: 3, icon: "time-outline" },
        { value: "3_to_6_months", label: "3–6 months", points: 2, icon: "time-outline" },
        { value: "more_than_6_months", label: "More than 6 months", points: 1, icon: "time-outline" },
      ],
    },
    {
      id: "itch_level",
      label: "How itchy is the affected area?",
      options: [
        { value: "not_itchy", label: "Not itchy", points: 5, icon: "hand-left-outline" },
        { value: "mild", label: "Mildly itchy", points: 3, icon: "hand-left-outline" },
        { value: "moderate", label: "Moderately itchy", points: 2, icon: "hand-left-outline" },
        { value: "very_itchy", label: "Very itchy, disrupts sleep", points: 1, icon: "hand-left-outline" },
      ],
    },
    {
      id: "coverage",
      label: "How much area is affected?",
      options: [
        { value: "small_spot", label: "Small spot (< palm size)", points: 5, icon: "square-outline" },
        { value: "medium_area", label: "Medium area (1–3 patches)", points: 3, icon: "stop-outline" },
        { value: "large_area", label: "Large area (widespread)", points: 1, icon: "checkbox-outline" },
      ],
    },
  ],
  psoriasis: [
    {
      id: "duration",
      label: "How long have you had psoriasis?",
      options: [
        { value: "less_than_6_months", label: "Less than 6 months", points: 4, icon: "time-outline" },
        { value: "6_to_12_months", label: "6–12 months", points: 3, icon: "time-outline" },
        { value: "1_to_5_years", label: "1–5 years", points: 2, icon: "time-outline" },
        { value: "more_than_5_years", label: "More than 5 years", points: 1, icon: "time-outline" },
      ],
    },
    {
      id: "coverage",
      label: "How widespread are the plaques?",
      options: [
        { value: "few_spots", label: "A few small spots", points: 5, icon: "square-outline" },
        { value: "moderate", label: "Moderate coverage", points: 3, icon: "stop-outline" },
        { value: "extensive", label: "Extensive coverage", points: 1, icon: "checkbox-outline" },
      ],
    },
    {
      id: "flare_frequency",
      label: "How often do flare-ups occur?",
      options: [
        { value: "rarely", label: "Rarely (a few times a year)", points: 5, icon: "flash-outline" },
        { value: "monthly", label: "Monthly", points: 3, icon: "flash-outline" },
        { value: "weekly", label: "Weekly or constant", points: 1, icon: "flash-outline" },
      ],
    },
  ],
  normal: [
    {
      id: "satisfaction",
      label: "How satisfied are you with your skin?",
      options: [
        { value: "very_satisfied", label: "Very satisfied", points: 5, icon: "happy-outline" },
        { value: "satisfied", label: "Satisfied", points: 4, icon: "happy-outline" },
        { value: "neutral", label: "Neutral", points: 3, icon: "remove-circle-outline" },
        { value: "unsatisfied", label: "Unsatisfied", points: 2, icon: "sad-outline" },
      ],
    },
    {
      id: "routine",
      label: "Do you follow a skincare routine?",
      options: [
        { value: "consistent", label: "Yes, consistently", points: 5, icon: "checkmark-circle-outline" },
        { value: "sometimes", label: "Sometimes", points: 3, icon: "checkmark-circle-outline" },
        { value: "no", label: "No routine", points: 1, icon: "checkmark-circle-outline" },
      ],
    },
    {
      id: "concern",
      label: "Any minor concerns?",
      options: [
        { value: "none", label: "None at all", points: 5, icon: "checkmark-circle-outline" },
        { value: "dryness", label: "Occasional dryness", points: 3, icon: "water-outline" },
        { value: "oiliness", label: "Some oiliness", points: 3, icon: "water-outline" },
        { value: "sensitivity", label: "Mild sensitivity", points: 2, icon: "alert-circle-outline" },
      ],
    },
  ],
};

const detectionMeta: Record<
  string,
  { icon: string; color: string; bg: string; description: string }
> = {
  acne: {
    icon: "flask-outline",
    color: "#B45309",
    bg: "#FEF3C7",
    description: "Acne detected on your skin",
  },
  eczema: {
    icon: "bandage-outline",
    color: "#DC2626",
    bg: "#FEE2E2",
    description: "Eczema detected on your skin",
  },
  psoriasis: {
    icon: "medkit-outline",
    color: "#7C3AED",
    bg: "#EDE9FE",
    description: "Psoriasis detected on your skin",
  },
  normal: {
    icon: "checkmark-circle-outline",
    color: "#15803D",
    bg: "#DCFCE7",
    description: "No significant conditions detected",
  },
};

export default function Survey() {
  const router = useRouter();
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const { imageUri, sourceType, label, confidence, probabilities } =
    useLocalSearchParams<{
      imageUri: string;
      sourceType: string;
      label: string;
      confidence: string;
      probabilities: string;
    }>();

  const detectionLabel = label ?? "normal";
  const questions = detectionQuestions[detectionLabel] ?? detectionQuestions.normal;
  const meta = detectionMeta[detectionLabel] ?? detectionMeta.normal;
  const currentQuestion = questions[page];
  const isAnswered = !!answers[currentQuestion.id];
  const isLastPage = page === questions.length - 1;
  const progressPct = Math.round(((page + 1) / questions.length) * 100);

  const calculateSeverityScore = () => {
    let totalPoints = 0;
    let maxPoints = 0;
    questions.forEach((q) => {
      const maxOpt = Math.max(...q.options.map((o) => o.points));
      maxPoints += maxOpt;
      const selected = q.options.find((o) => o.value === answers[q.id]);
      if (selected) totalPoints += selected.points;
    });
    if (maxPoints === 0) return 0;
    return Math.round((totalPoints / maxPoints) * 100);
  };

  const handleSelect = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleNext = () => {
    if (!isAnswered) return;
    if (isLastPage) {
      const severityScore = calculateSeverityScore();
      router.replace({
        pathname: "/(modules)/scan-results",
        params: {
          imageUri: imageUri ?? "",
          sourceType: sourceType ?? "gallery",
          label: detectionLabel,
          confidence: confidence ?? "0",
          probabilities: probabilities ?? "{}",
          surveyAnswers: JSON.stringify(answers),
          severityScore: String(severityScore),
        },
      });
      return;
    }
    pagerRef.current?.setPage(page + 1);
  };

  const handleBack = () => {
    if (page === 0) return;
    pagerRef.current?.setPage(page - 1);
  };

  return (
    <SafeAreaView className="bg-gray-50 flex-1">
      <View className="px-6 pt-4 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-semibold text-gray-500 text-xs tracking-wide">
            STEP {page + 1} OF {questions.length}
          </Text>
          <Text className="text-xs text-gray-500">{progressPct}%</Text>
        </View>
        <InlineProgress progress={progressPct} height={8} color="#15803D" />
      </View>

      {/* Detection badge */}
      <View className="px-6 pt-4">
        <View
          className="flex-row items-center gap-3 rounded-2xl py-3 px-4"
          style={{ backgroundColor: meta.bg }}
        >
          <View
            className="h-10 w-10 rounded-full items-center justify-center"
            style={{ backgroundColor: "white" }}
          >
            <Ionicons name={meta.icon as any} size={20} color={meta.color} />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-gray-900">{meta.description}</Text>
            <Text className="text-xs text-gray-500">
              Confidence: {Math.round(Number(confidence) * 100)}%
            </Text>
          </View>
        </View>
      </View>

      <PagerView
        ref={pagerRef}
        style={{ flex: 1, marginTop: 18 }}
        initialPage={0}
        scrollEnabled={false}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        {questions.map((item, index) => (
          <View key={index} className="px-6 gap-4">
            <Text className="text-2xl font-bold text-green-700">
              {item.label}
            </Text>
            <View className="bg-white rounded-3xl shadow-sm p-3 flex-col gap-2">
              {item.options.map((option, optIndex) => {
                const isSelected = answers[item.id] === option.value;
                return (
                  <Pressable
                    key={optIndex}
                    onPress={() => handleSelect(item.id, option.value)}
                    className={`flex-row items-center gap-3 rounded-2xl py-4 px-4 border active:opacity-90 ${
                      isSelected
                        ? "bg-green-700 border-green-700"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <View
                      className={`h-9 w-9 items-center justify-center rounded-full ${
                        isSelected ? "bg-white/20" : "bg-white"
                      }`}
                    >
                      <Ionicons
                        name={option.icon as any}
                        size={18}
                        color={isSelected ? "white" : "#15803D"}
                      />
                    </View>
                    <Text
                      className={`flex-1 font-semibold ${
                        isSelected ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {option.label}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="white"
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </PagerView>

      <View className="gap-3 px-6 pb-6">
        <Pressable
          disabled={!isAnswered}
          className={`rounded-full p-4 active:opacity-80 ${
            isAnswered ? "bg-green-700" : "bg-green-700/40"
          }`}
          onPress={handleNext}
        >
          <View className="flex-row items-center justify-center gap-1">
            <Text className="font-bold text-white">
              {isLastPage ? "See Results" : "Next"}
            </Text>
            {!isLastPage && (
              <Ionicons name="arrow-forward" size={16} color="white" />
            )}
          </View>
        </Pressable>
        {page !== 0 && (
          <Pressable
            className="rounded-full border border-green-700 p-4 active:opacity-80"
            onPress={handleBack}
          >
            <Text className="text-center font-bold text-green-700">Back</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
