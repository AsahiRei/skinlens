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
import ScrollPicker from "@/components/ScrollPicker";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import profileOptions from "@/data/profile-options.json";
import questionPage from "@/data/user-setup-questions.json";

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

const MONTHS = profileOptions.months;
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1949 }, (_, i) => String(CURRENT_YEAR - i));

export default function Setup() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const router = useRouter();
  // NOTE: no pre-filled date of birth — the wheels visually start at
  // January 1 of the current year, but the answer only counts once the user
  // actually touches them (dateTouched), so nobody saves themselves as a
  // newborn by skipping the question.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dateValues, setDateValues] = useState({
    month: 0,
    day: 0,
    year: 0,
  });
  const [dateTouched, setDateTouched] = useState(false);

  const currentQuestion = questionPage[page];
  const isAnswered =
    currentQuestion.type === "text"
      ? !!answers[currentQuestion.id]?.trim()
      : currentQuestion.type === "date"
        ? dateTouched && !!answers[currentQuestion.id]
        : !!answers[currentQuestion.id];
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
        {questionPage.map((item, index) => {
          if (Math.abs(index - page) > 1) return <View key={index} />;
          return (
          <View key={index} className="px-6 gap-4">
            <Text className="text-2xl font-bold text-green-700">
              {item.label}
            </Text>
            {item.type === "options" && (
              <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex-col gap-2">
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
            {item.type === "text" && (
              <View className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
                <TextInput
                  value={answers[item.id] || ""}
                  onChangeText={(text) => handleSelect(item.id, text)}
                  placeholder="Type here..."
                  className="text-gray-900"
                  placeholderTextColor="#9CA3AF"
                  autoFocus
                />
              </View>
            )}
            {item.type === "date" && (
              <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <View className="flex-row gap-3">
                  <View className="flex-1 items-center gap-2">
                    <Text className="text-xs font-semibold text-gray-500">Month</Text>
                    <ScrollPicker
                      items={MONTHS}
                      selectedIndex={dateValues.month}
                      onValueChange={(idx) => {
                        const updated = { ...dateValues, month: idx };
                        setDateValues(updated);
                        setDateTouched(true);
                        handleSelect(
                          item.id,
                          `${MONTHS[updated.month]} ${DAYS[updated.day]}, ${YEARS[updated.year]}`,
                        );
                      }}
                    />
                  </View>
                  <View className="flex-1 items-center gap-2">
                    <Text className="text-xs font-semibold text-gray-500">Day</Text>
                    <ScrollPicker
                      items={DAYS}
                      selectedIndex={dateValues.day}
                      onValueChange={(idx) => {
                        const updated = { ...dateValues, day: idx };
                        setDateValues(updated);
                        setDateTouched(true);
                        handleSelect(
                          item.id,
                          `${MONTHS[updated.month]} ${DAYS[updated.day]}, ${YEARS[updated.year]}`,
                        );
                      }}
                    />
                  </View>
                  <View className="flex-1 items-center gap-2">
                    <Text className="text-xs font-semibold text-gray-500">Year</Text>
                    <ScrollPicker
                      items={YEARS}
                      selectedIndex={dateValues.year}
                      onValueChange={(idx) => {
                        const updated = { ...dateValues, year: idx };
                        setDateValues(updated);
                        setDateTouched(true);
                        handleSelect(
                          item.id,
                          `${MONTHS[updated.month]} ${DAYS[updated.day]}, ${YEARS[updated.year]}`,
                        );
                      }}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
          );
        })}
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
