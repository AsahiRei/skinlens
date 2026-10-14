import { useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import PagerView from "react-native-pager-view";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ArrowRight,
  Calendar,
  Camera as CameraIcon,
  Check,
} from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import { KeyboardAvoidingWrapper } from "@/components/KeyboardAwareView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { cardShadow, theme } from "@/lib/theme";
import profileOptions from "@/data/profile-options.json";
import questionPage from "@/data/user-setup-questions.json";
import { ScreenGradient } from "@/components/ScreenGradient";

const MONTHS: string[] = profileOptions.months;
const MIN_DOB = new Date(1950, 0, 1);
const DOB_FALLBACK = new Date(2000, 0, 1);

function formatDob(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export default function Setup() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const router = useRouter();
  // NOTE: no pre-filled date of birth — `dob` stays null until the user
  // picks a date in the native picker, so nobody saves themselves as a
  // newborn by skipping the question. The stored string keeps the
  // "Month D, YYYY" shape so downstream readers (loading, edit-profile,
  // report) keep working unchanged.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(Platform.OS === "ios");
  const [dateTouched, setDateTouched] = useState(false);

  const currentQuestion = questionPage[page];
  // Photo ask is the final step of this pager.
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
    // skipIntro=1 because the photo ask already showed here.
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
                {Platform.OS === "ios" ? (
                  <DateTimePicker
                    value={dob ?? DOB_FALLBACK}
                    mode="date"
                    display="spinner"
                    minimumDate={MIN_DOB}
                    maximumDate={new Date()}
                    onChange={(_event, selected) => {
                      if (!selected) return;
                      setDob(selected);
                      setDateTouched(true);
                      handleSelect(item.id, formatDob(selected));
                    }}
                  />
                ) : (
                  <>
                    <Pressable
                      onPress={() => setShowPicker(true)}
                      className="flex-row items-center gap-3 rounded-2xl py-4 px-4 border active:opacity-90"
                      style={{ backgroundColor: "#FFFFFF", borderColor: "#E5EDE8" }}
                    >
                      <View
                        className="h-9 w-9 items-center justify-center rounded-full"
                        style={{ backgroundColor: "#EAF6EE" }}
                      >
                        <Calendar size={18} color="#15803D" />
                      </View>
                      <Text
                        className="flex-1 font-semibold"
                        style={{ color: dob ? "#10241A" : "#9CA3AF" }}
                      >
                        {dob ? formatDob(dob) : "Select your date of birth"}
                      </Text>
                    </Pressable>
                    {showPicker && (
                      <DateTimePicker
                        value={dob ?? DOB_FALLBACK}
                        mode="date"
                        display="default"
                        minimumDate={MIN_DOB}
                        maximumDate={new Date()}
                        onChange={(event, selected) => {
                          // Android dialog: dismiss leaves the answer untouched.
                          if (event?.type === "dismissed") {
                            setShowPicker(false);
                            return;
                          }
                          if (selected) {
                            setDob(selected);
                            setDateTouched(true);
                            handleSelect(item.id, formatDob(selected));
                          }
                          setShowPicker(false);
                        }}
                      />
                    )}
                  </>
                )}
              </View>
            )}
          </View>
          );
        })}
        {/* Final step: profile picture ask. */}
        {Math.abs(questionPage.length - page) <= 1 ? (
          <View key="photo" className="px-5 gap-4">
            <Text className="text-[22px] font-bold" style={{ color: "#10241A" }}>
              Take a profile picture
            </Text>
            <Text className="text-sm leading-5" style={{ color: "#6B7280" }}>
              You&apos;ll take one photo on the next screen.
            </Text>
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
