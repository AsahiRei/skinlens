import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import PagerView from "react-native-pager-view";
import {
  ArrowRight,
  Camera as CameraIcon,
  Check,
  Sun,
  Glasses,
  ScanFace,
  ShieldCheck,
} from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import ScrollPicker from "@/components/ScrollPicker";
import { KeyboardAvoidingWrapper } from "@/components/KeyboardAwareView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { cardShadow, theme } from "@/lib/theme";
import profileOptions from "@/data/profile-options.json";
import questionPage from "@/data/user-setup-questions.json";
import { ScreenGradient } from "@/components/ScreenGradient";

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
  // The profile-picture ask is the final step of this same pager, so the
  // camera never opens without warning.
  const totalSteps = questionPage.length + 1;
  const isPhotoStep = page >= questionPage.length;
  const isAnswered = isPhotoStep
    ? true
    : currentQuestion.type === "text"
      ? !!answers[currentQuestion.id]?.trim()
      : currentQuestion.type === "date"
        ? dateTouched && !!answers[currentQuestion.id]
        : !!answers[currentQuestion.id];
  const progressPct = Math.round(((page + 1) / totalSteps) * 100);
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
  const goToFaceEnroll = () => {
    const healthScore = calculateHealthScore(answers, questionPage);
    // Face enrollment is mandatory before results — loading.tsx also
    // guards this so the step can't be skipped by deep-linking.
    // skipIntro=1 because the photo ask was already shown as the last
    // step here, so face-enroll can open the camera directly.
    router.replace({
      pathname: "/(user-setup)/face-enroll",
      params: {
        healthScore: healthScore.toString(),
        answers: JSON.stringify(answers),
        skipIntro: "1",
      },
    });
  };
  const handleNext = () => {
    if (!isAnswered) return;
    if (isPhotoStep) {
      goToFaceEnroll();
      return;
    }
    // From the last question this advances to the photo step; from the
    // photo step the CTA above navigates to the camera.
    pagerRef.current?.setPage(page + 1);
  };
  //back
  const handleBack = () => {
    if (page === 0) return;
    pagerRef.current?.setPage(page - 1);
  };
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <View className="px-5 pt-4 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-[11px]" style={{ color: "#15803D", letterSpacing: 1 }}>
            STEP {page + 1} OF {totalSteps}
          </Text>
          <Text className="text-xs" style={{ color: "#6B7280" }}>{progressPct}%</Text>
        </View>
        <InlineProgress progress={progressPct} height={8} color="#15803D" trackColor="#EAF6EE" />
      </View>
      <KeyboardAvoidingWrapper>
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
          <View key={index} className="px-5 gap-4">
            <Text className="text-[22px] font-bold" style={{ color: "#10241A" }}>
              {item.label}
            </Text>
            {item.type === "options" && (
              <View className="bg-white rounded-[20px] p-3 flex-col gap-2" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
                {item.options?.map((option: any, optIndex: number) => {
                  const isSelected = answers[item.id] === option.value;
                  return (
                    <Pressable
                      key={optIndex}
                      onPress={() => handleSelect(item.id, option.value)}
                      className="flex-row items-center gap-3 rounded-2xl py-4 px-4 border active:opacity-90"
                      style={
                        isSelected
                          ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                          : { backgroundColor: "#FFFFFF", borderColor: "#E5EDE8" }
                      }
                    >
                      <View
                        className="h-9 w-9 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: isSelected ? "rgba(255,255,255,0.2)" : "#EAF6EE",
                        }}
                      >
                        <Text
                          className="font-bold text-[15px]"
                          style={{ color: isSelected ? "#FFFFFF" : "#15803D" }}
                        >
                          {optIndex + 1}
                        </Text>
                      </View>
                      <Text
                        className="flex-1 font-semibold"
                        style={{ color: isSelected ? "#FFFFFF" : "#10241A" }}
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
              <View className="bg-white rounded-2xl px-4 py-3" style={{ borderWidth: 1, borderColor: "#E5EDE8" }}>
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
              <View className="bg-white rounded-[20px] p-4" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
                <View className="flex-row gap-3">
                  <View className="flex-1 items-center gap-2">
                    <Text className="text-xs font-semibold" style={{ color: "#6B7280" }}>Month</Text>
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
                    <Text className="text-xs font-semibold" style={{ color: "#6B7280" }}>Day</Text>
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
                    <Text className="text-xs font-semibold" style={{ color: "#6B7280" }}>Year</Text>
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
        {/* Final step: ask for the profile picture before the camera opens. */}
        {Math.abs(questionPage.length - page) <= 1 ? (
          <View key="photo" className="px-5 gap-4">
            <View>
              <Text className="text-[22px] font-bold" style={{ color: "#10241A" }}>
                Take a profile picture
              </Text>
              <Text className="text-sm mt-1 leading-5" style={{ color: "#6B7280" }}>
                Last step! This becomes your profile picture and helps verify it&apos;s you on future scans.
              </Text>
            </View>
            <View className="items-center">
              <View style={{ position: "relative" }}>
                <View
                  className="items-center justify-center"
                  style={{
                    width: 104,
                    height: 104,
                    borderRadius: 52,
                    backgroundColor: "#FFFFFF",
                    borderWidth: 2,
                    borderColor: "#E5EDE8",
                    borderStyle: "dashed",
                    ...cardShadow,
                  }}
                >
                  <ScanFace size={40} color="#15803D" strokeWidth={1.5} />
                </View>
                <View
                  className="items-center justify-center"
                  style={{
                    position: "absolute",
                    right: 0,
                    bottom: 0,
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: "#10241A",
                    borderWidth: 3,
                    borderColor: "#F4F7F5",
                  }}
                >
                  <CameraIcon size={14} color="#FFFFFF" />
                </View>
              </View>
            </View>
            <View className="bg-white rounded-[20px] px-4 py-2" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
              {[
                { icon: Sun, title: "Find good light", copy: "Face a window or lamp." },
                { icon: ScanFace, title: "Center your face", copy: "Keep your whole face in frame." },
                { icon: Glasses, title: "Keep your face clear", copy: "Remove sunglasses or hats." },
              ].map((tip, i, arr) => (
                <View
                  key={tip.title}
                  className="flex-row items-center gap-3 py-2"
                  style={
                    i < arr.length - 1
                      ? { borderBottomWidth: 1, borderBottomColor: "#EEF2EF" }
                      : undefined
                  }
                >
                  <View
                    className="items-center justify-center"
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#EAF6EE" }}
                  >
                    <tip.icon size={16} color="#15803D" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-[13px]" style={{ color: "#10241A" }}>
                      {tip.title}
                    </Text>
                    <Text className="text-xs" style={{ color: "#6B7280" }}>
                      {tip.copy}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            <View className="flex-row items-start justify-center gap-1.5 px-4">
              <ShieldCheck size={13} color="#9CA3AF" style={{ marginTop: 1 }} />
              <Text className="text-xs text-center leading-4" style={{ color: "#9CA3AF" }}>
                Stored securely, only used for scan verification.
              </Text>
            </View>
          </View>
        ) : (
          <View key="photo" />
        )}
      </PagerView>
      <View className="gap-3 px-5 pb-6">
        <PrimaryButton
          label={isPhotoStep ? "Take Profile Picture" : "Next"}
          onPress={handleNext}
          disabled={!isAnswered}
          icon={isPhotoStep ? CameraIcon : ArrowRight}
        />
        {page !== 0 && (
          <SecondaryButton label="Back" onPress={handleBack} />
        )}
      </View>
      </KeyboardAvoidingWrapper>
    </SafeAreaView>
  );
}
