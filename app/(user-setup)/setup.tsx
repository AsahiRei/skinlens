import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import PagerView from "react-native-pager-view";
import {
  ArrowRight,
  Check,
  User,
  Leaf,
  Layers,
  Sun,
  Droplets,
  AlertCircle,
  CheckCircle,
  Palette,
  FlaskConical,
  Bandage,
  Cross,
  Moon,
  CloudSun,
  Coffee,
  Smile,
  MinusCircle,
  Frown,
  AlertTriangle,
} from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";

const ICON_MAP: Record<string, typeof User> = {
  "male-outline": User,
  "female-outline": User,
  "leaf-outline": Leaf,
  "layers-outline": Layers,
  "sunny-outline": Sun,
  "water-outline": Droplets,
  "water": Droplets,
  "alert-circle-outline": AlertCircle,
  "checkmark-circle-outline": CheckCircle,
  "checkmark-circle": CheckCircle,
  "color-palette-outline": Palette,
  "flask-outline": FlaskConical,
  "bandage-outline": Bandage,
  "medkit-outline": Cross,
  "moon": Moon,
  "moon-outline": Moon,
  "partly-sunny-outline": CloudSun,
  "cafe-outline": Coffee,
  "happy-outline": Smile,
  "remove-circle-outline": MinusCircle,
  "sad-outline": Frown,
  "beaker-outline": FlaskConical,
  "warning-outline": AlertTriangle,
};

const questionPage = [
  {
    id: "gender",
    label: "What's your gender?",
    type: "options",
    options: [
      { value: "male", label: "Male", points: 0, icon: "male-outline" },
      { value: "female", label: "Female", points: 0, icon: "female-outline" },
    ],
  },
  {
    id: "skin_type",
    label: "What best describes your skin type?",
    type: "options",
    options: [
      { label: "Normal", value: "normal", points: 5, icon: "leaf-outline" },
      {
        label: "Combination",
        value: "combination",
        points: 4,
        icon: "layers-outline",
      },
      { label: "Dry", value: "dry", points: 3, icon: "sunny-outline" },
      { label: "Oily", value: "oily", points: 3, icon: "water-outline" },
      {
        label: "Sensitive",
        value: "sensitive",
        points: 2,
        icon: "alert-circle-outline",
      },
    ],
  },
  {
    id: "main_concern",
    label: "What is your primary skin concern?",
    type: "options",
    options: [
      {
        label: "None",
        value: "none",
        points: 5,
        icon: "checkmark-circle-outline",
      },
      {
        label: "Pigmentation",
        value: "pigmentation",
        points: 3,
        icon: "color-palette-outline",
      },
      { label: "Acne", value: "acne", points: 2, icon: "flask-outline" },
      { label: "Eczema", value: "eczema", points: 1, icon: "bandage-outline" },
      {
        label: "Psoriasis",
        value: "psoriasis",
        points: 1,
        icon: "medkit-outline",
      },
    ],
  },
  {
    id: "sleep_quality",
    label: "How many hours do you sleep on average each night?",
    type: "options",
    options: [
      { label: "8–9 hours", value: "excellent", points: 5, icon: "moon" },
      { label: "7 hours", value: "good", points: 4, icon: "moon-outline" },
      {
        label: "6 hours",
        value: "fair",
        points: 3,
        icon: "partly-sunny-outline",
      },
      { label: "5 hours", value: "poor", points: 2, icon: "cafe-outline" },
      {
        label: "Less than 5 hours",
        value: "very_poor",
        points: 1,
        icon: "alert-circle-outline",
      },
    ],
  },
  {
    id: "stress_level",
    label: "How would you rate your daily stress level?",
    type: "options",
    options: [
      {
        label: "Very Low",
        value: "very_low",
        points: 5,
        icon: "happy-outline",
      },
      { label: "Low", value: "low", points: 4, icon: "happy-outline" },
      {
        label: "Moderate",
        value: "moderate",
        points: 3,
        icon: "remove-circle-outline",
      },
      { label: "High", value: "high", points: 2, icon: "sad-outline" },
      {
        label: "Very High",
        value: "very_high",
        points: 1,
        icon: "alert-circle-outline",
      },
    ],
  },
  {
    id: "water_intake",
    label: "How much water do you drink per day?",
    type: "options",
    options: [
      {
        label: "More than 2 liters",
        value: "more_than_2l",
        points: 5,
        icon: "water",
      },
      {
        label: "1.5–2 liters",
        value: "1_5_to_2l",
        points: 4,
        icon: "water-outline",
      },
      {
        label: "1–1.5 liters",
        value: "1_to_1_5l",
        points: 3,
        icon: "beaker-outline",
      },
      {
        label: "500 mL–1 liter",
        value: "500ml_to_1l",
        points: 2,
        icon: "flask-outline",
      },
      {
        label: "Less than 500 mL",
        value: "less_than_500ml",
        points: 1,
        icon: "warning-outline",
      },
    ],
  },
];

export default function setup() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const currentQuestion = questionPage[page];
  const isAnswered = !!answers[currentQuestion.id];
  const isLastPage = page === questionPage.length - 1;
  const progressPct = Math.round(((page + 1) / questionPage.length) * 100);
  //calculate the health score
  const calculateHealthScore = (
    answers: Record<string, string>,
    questions: typeof questionPage,
  ) => {
    let totalPoints = 0;
    let maxPoints = 0;
    questions.forEach((question) => {
      if (question.type !== "options" || !question.options?.length) return;
      const maxOptionPoints = Math.max(
        ...question.options.map((opt: any) => opt.points),
      );
      maxPoints += maxOptionPoints;
      const selectedValue = answers[question.id];
      const selectedOption = question.options.find(
        (opt: any) => opt.value === selectedValue,
      );
      if (selectedOption) totalPoints += selectedOption.points;
    });
    if (maxPoints === 0) return 0;
    return Math.round((totalPoints / maxPoints) * 100);
  };
  //select answers
  const handleSelect = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };
  //next
  const handleNext = () => {
    if (!isAnswered) return;
    if (isLastPage) {
      const healthScore = calculateHealthScore(answers, questionPage);
      router.replace({
        pathname: "/(user-setup)/loading",
        params: {
          healthScore: healthScore.toString(),
          answers: JSON.stringify(answers),
        },
      });
      console.log(healthScore.toString());
      return;
    }
    pagerRef.current?.setPage(page + 1);
  };
  //back
  const handleBack = () => {
    if (page === 0) return;
    pagerRef.current?.setPage(page - 1);
  };
  return (
    <SafeAreaView className="bg-gray-50 flex-1">
      <View className="px-6 pt-4 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-semibold text-gray-500 text-xs tracking-wide">
            STEP {page + 1} OF {questionPage.length}
          </Text>
          <Text className="text-xs text-gray-500">{progressPct}%</Text>
        </View>
        <InlineProgress progress={progressPct} height={8} color="#15803D" />
      </View>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1, marginTop: 18 }}
        initialPage={0}
        scrollEnabled={false}
        onPageSelected={(e) => {
          setPage(e.nativeEvent.position);
        }}
      >
        {questionPage.map((item, index) => (
          <View key={index} className="px-6 gap-4">
            <Text className="text-2xl font-bold text-green-700">
              {item.label}
            </Text>
            {item.type === "options" && (
              <View className="bg-white rounded-xl border border-gray-100 p-3 flex-col gap-2">
                {item.options?.map((option: any, index: any) => {
                  const isSelected = answers[item.id] === option.value;
                  return (
                    <Pressable
                      key={index}
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
                        {(() => {
                          const IconComp = ICON_MAP[option.icon] || AlertCircle;
                          return <IconComp size={18} color={isSelected ? "white" : "#15803D"} />;
                        })()}
                      </View>
                      <Text
                        className={`flex-1 font-semibold ${
                          isSelected ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {option.label}
                      </Text>
                      {isSelected && (
                        <Check
                          size={20}
                          color="white"
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
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
              {isLastPage ? "Get Started" : "Next"}
            </Text>
            {!isLastPage && (
              <ArrowRight size={16} color="white" />
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
