import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import PagerView from "react-native-pager-view";
import {
  ArrowRight,
  Check,
  Clock,
  Eye,
  User,
  Hand,
  Square,
  StopCircle,
  CheckSquare,
  Zap,
  Smile,
  MinusCircle,
  Frown,
  CheckCircle,
  Droplets,
  AlertCircle,
  FlaskConical,
  Bandage,
  Cross,
} from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import detectionMetaJson from "@/data/detection-meta.json";
import detectionQuestionsJson from "@/data/survey-questions.json";

const ICON_MAP: Record<string, typeof Clock> = {
  "time-outline": Clock,
  "eye-outline": Eye,
  "person-outline": User,
  "hand-left-outline": Hand,
  "square-outline": Square,
  "stop-outline": StopCircle,
  "checkbox-outline": CheckSquare,
  "flash-outline": Zap,
  "happy-outline": Smile,
  "remove-circle-outline": MinusCircle,
  "sad-outline": Frown,
  "checkmark-circle-outline": CheckCircle,
  "checkmark-circle": CheckCircle,
  "water-outline": Droplets,
  "alert-circle-outline": AlertCircle,
  "flask-outline": FlaskConical,
  "bandage-outline": Bandage,
  "medkit-outline": Cross,
};

const detectionQuestions: Record<
  string,
  {
    id: string;
    label: string;
    options: { value: string; label: string; points: number; icon: string }[];
  }[]
> = detectionQuestionsJson;

const detectionMeta: Record<
  string,
  { icon: string; color: string; bg: string; description: string }
> = detectionMetaJson;

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
            {(() => {
              const IconComp = ICON_MAP[meta.icon] || AlertCircle;
              return <IconComp size={20} color={meta.color} />;
            })()}
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
            <View className="bg-white rounded-xl border border-gray-100 p-3 flex-col gap-2">
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
