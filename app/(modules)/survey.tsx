import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import PagerView from "react-native-pager-view";
import {
  ArrowRight,
  Check,
  CheckCircle,
  Droplets,
  AlertCircle,
  FlaskConical,
  Bandage,
} from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ClinicalCard, PrimaryButton, SecondaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import detectionMetaJson from "@/data/detection-meta.json";
import detectionQuestionsJson from "@/data/survey-questions.json";
import { ScreenGradient } from "@/components/ScreenGradient";

const ICON_MAP: Record<string, typeof CheckCircle> = {
  "checkmark-circle-outline": CheckCircle,
  "checkmark-circle": CheckCircle,
  "water-outline": Droplets,
  "flask-outline": FlaskConical,
  "bandage-outline": Bandage,
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <View className="px-5 pt-4 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-[11px]" style={{ color: theme.colors.primary, letterSpacing: 1 }}>
            STEP {page + 1} OF {questions.length}
          </Text>
          <Text className="text-xs" style={{ color: theme.colors.muted }}>{progressPct}%</Text>
        </View>
        <InlineProgress progress={progressPct} height={8} color={theme.colors.primary} trackColor={theme.colors.primarySoft} />
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
            <Text className="text-xs" style={{ color: theme.colors.muted }}>
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
          <View key={index} className="px-5 gap-4">
            <Text className="text-[22px] font-bold" style={{ color: theme.colors.ink }}>
              {item.label}
            </Text>
            <ClinicalCard className="flex-col gap-2" style={{ padding: 12 }}>
              {item.options.map((option, optIndex) => {
                const isSelected = answers[item.id] === option.value;
                return (
                  <Pressable
                    key={optIndex}
                    onPress={() => handleSelect(item.id, option.value)}
                    className="flex-row items-center gap-3 rounded-2xl py-4 px-4 border active:opacity-90"
                    style={
                      isSelected
                        ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                        : { backgroundColor: "#FFFFFF", borderColor: theme.colors.cardBorder }
                    }
                  >
                    <View
                      className="h-9 w-9 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: isSelected ? "rgba(255,255,255,0.2)" : theme.colors.primarySoft,
                      }}
                    >
                      <Text
                        className="font-bold text-[15px]"
                        style={{ color: isSelected ? "#FFFFFF" : theme.colors.primary }}
                      >
                        {optIndex + 1}
                      </Text>
                    </View>
                    <Text
                      className="flex-1 font-semibold"
                      style={{ color: isSelected ? "#FFFFFF" : theme.colors.ink }}
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
            </ClinicalCard>
          </View>
        ))}
      </PagerView>

      <View className="gap-3 px-5 pb-6">
        <PrimaryButton
          label={isLastPage ? "See Results" : "Next"}
          onPress={handleNext}
          disabled={!isAnswered}
          icon={isLastPage ? undefined : ArrowRight}
        />
        {page !== 0 && (
          <SecondaryButton label="Back" onPress={handleBack} />
        )}
      </View>
    </SafeAreaView>
  );
}
