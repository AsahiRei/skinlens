import { useRef, useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import PagerView from "react-native-pager-view";
import DateTimePicker from "@react-native-community/datetimepicker";
import { AlertTriangle, Calendar, Check } from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import { KeyboardAvoidingWrapper } from "@/components/KeyboardAwareView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { PrimaryButton, ClinicalCard, Notice, SecondaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import Animated from "react-native-reanimated";
import { fadeIn, fadeOut, popIn, PressableScale } from "@/components/motion";
import questionsJson from "@/data/user-setup-questions.json";
import { ScreenGradient } from "@/components/ScreenGradient";
import { MIN_AGE, formatDob, getMaxDob, isOldEnough } from "@/lib/age";
import { FIRST_NAME_MAX_LENGTH, firstNameError } from "@/lib/validation";
import {
  MULTI_SEPARATOR,
  type SetupQuestion,
  EXCLUSIVE_COMBINATION_DETAILS,
  computeSetupScore,
  excludedConcerns,
  sanitizeSetupAnswers,
  setupContradiction,
  splitMulti,
} from "@/utils/setup-score";

const questionPage = questionsJson as SetupQuestion[];

/** Branching: drop a main-concern answer the (changed) skin type no longer allows. */
function pruneConcern(answers: Record<string, string>): Record<string, string> {
  if (!answers.main_concern || !excludedConcerns(answers).includes(answers.main_concern)) {
    return answers;
  }
  const { main_concern: _dropped, ...rest } = answers;
  return rest;
}

const MIN_DOB = new Date(1950, 0, 1);
const MAX_DOB = getMaxDob();
const DOB_FALLBACK = new Date(Math.min(new Date(2000, 0, 1).getTime(), MAX_DOB.getTime()));

export default function Setup() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const router = useRouter();
  // Face crop from the skin scan, which now runs before these questions.
  const { photoUri } = useLocalSearchParams<{ photoUri?: string }>();
  // NOTE: no pre-filled date of birth — `dob` stays null until the user picks a date in the native
  // picker, so nobody saves themselves as a newborn by skipping the question.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(Platform.OS === "ios");
  const [dateTouched, setDateTouched] = useState(false);

  const currentQuestion = questionPage[page];
  const totalSteps = questionPage.length;
  const isLastStep = page >= questionPage.length - 1;
  const isAnswered =
    currentQuestion.type === "text"
      ? firstNameError(answers[currentQuestion.id] ?? "") === null
      : currentQuestion.type === "date"
        ? dateTouched && !!answers[currentQuestion.id] && !!dob && isOldEnough(dob)
        : !!answers[currentQuestion.id];
  const progressPct = Math.round(((page + 1) / totalSteps) * 100);
  //select answers
  const handleSelect = (questionId: string, value: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      // Combination sub-chips are stored as `<questionId>_<detail>`; drop them when the user
      // switches away from "combination" so they don't linger as phantom answers.
      if (value !== "combination") {
        for (const key of Object.keys(next)) {
          if (key.startsWith(`${questionId}_`)) delete next[key];
        }
      }
      return pruneConcern(next);
    });
  };
  // Multi-select: "none" clears the rest, picking anything else clears "none".
  const toggleMulti = (questionId: string, value: string) => {
    setAnswers((prev) => {
      const current = splitMulti(prev[questionId]);
      let next: string[];
      if (value === "none") next = current.includes("none") ? [] : ["none"];
      else if (current.includes(value)) next = current.filter((v) => v !== value);
      else next = [...current.filter((v) => v !== "none"), value];
      return { ...prev, [questionId]: next.join(MULTI_SEPARATOR) };
    });
  };
  const contradiction = setupContradiction(answers);
  const finishSetup = () => {
    const cleanAnswers = sanitizeSetupAnswers(answers);
    const healthScore = computeSetupScore(cleanAnswers);
    router.replace({
      pathname: "/(user-setup)/loading",
      params: {
        healthScore: healthScore.toString(),
        answers: JSON.stringify(cleanAnswers),
        // loading only grades a local file:// crop, so a missing/odd value is dropped there.
        ...(typeof photoUri === "string" && photoUri ? { photoUri } : {}),
      },
    });
  };
  const handleNext = () => {
    if (!isAnswered) return;
    if (isLastStep) {
      finishSetup();
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
          <Text
            className="font-bold text-[11px]"
            style={{ color: theme.colors.primary, letterSpacing: 1 }}
          >
            STEP {page + 1} OF {totalSteps}
          </Text>
          <Text className="text-xs" style={{ color: theme.colors.muted }}>
            {progressPct}%
          </Text>
        </View>
        <InlineProgress
          progress={progressPct}
          height={8}
          color={theme.colors.primary}
          trackColor={theme.colors.primarySoft}
        />
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
                <View className="gap-1.5">
                  <Text className="text-[22px] font-bold" style={{ color: theme.colors.ink }}>
                    {item.label}
                  </Text>
                  {item.hint && (
                    <Text className="text-sm leading-5" style={{ color: theme.colors.muted }}>
                      {item.hint}
                    </Text>
                  )}
                </View>
                {item.type === "multi" && (
                  <View className="flex-row flex-wrap gap-2">
                    {item.options?.map((option) => {
                      const isSelected = splitMulti(answers[item.id]).includes(option.value);
                      return (
                        <PressableScale
                          key={option.value}
                          onPress={() => toggleMulti(item.id, option.value)}
                          activeScale={0.96}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                          className="flex-row items-center gap-1.5 rounded-full px-4 py-2.5 border"
                          style={
                            isSelected
                              ? {
                                  backgroundColor: theme.colors.primary,
                                  borderColor: theme.colors.primary,
                                }
                              : { backgroundColor: "#FFFFFF", borderColor: theme.colors.cardBorder }
                          }
                        >
                          {isSelected && <Check size={14} color="white" />}
                          <Text
                            className="text-sm font-semibold"
                            style={{ color: isSelected ? "#FFFFFF" : theme.colors.ink }}
                          >
                            {option.label}
                          </Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                )}
                {item.type === "options" && (
                  <ClinicalCard className="flex-col gap-2" style={{ padding: 12 }}>
                    {item.options
                      ?.filter(
                        (option) =>
                          item.id !== "main_concern" ||
                          !excludedConcerns(answers).includes(option.value),
                      )
                      .map((option, optIndex) => {
                        const isSelected = answers[item.id] === option.value;
                        return (
                          <PressableScale
                            key={optIndex}
                            onPress={() => handleSelect(item.id, option.value)}
                            activeScale={0.98}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                            className="flex-row items-center gap-3 rounded-2xl py-4 px-4 border"
                            style={
                              isSelected
                                ? {
                                    backgroundColor: theme.colors.primary,
                                    borderColor: theme.colors.primary,
                                  }
                                : {
                                    backgroundColor: "#FFFFFF",
                                    borderColor: theme.colors.cardBorder,
                                  }
                            }
                          >
                            <View
                              className="h-9 w-9 items-center justify-center rounded-full"
                              style={{
                                backgroundColor: isSelected
                                  ? "rgba(255,255,255,0.2)"
                                  : theme.colors.primarySoft,
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
                              <Animated.View entering={popIn}>
                                <Check size={20} color="white" />
                              </Animated.View>
                            )}
                          </PressableScale>
                        );
                      })}
                    {answers[item.id] === "combination" && (
                      <Animated.View
                        entering={fadeIn}
                        exiting={fadeOut}
                        className="mt-2 gap-2 px-2"
                      >
                        <Text className="text-xs font-medium" style={{ color: theme.colors.muted }}>
                          Specify combination details:
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {["Oily", "Dry", "Acne", "Sensitive"].map((detail) => {
                            const detailId = `${item.id}_${detail.toLowerCase()}`;
                            const isDetailSelected = answers[detailId] === "true";
                            return (
                              <PressableScale
                                key={detail}
                                activeScale={0.94}
                                onPress={() => {
                                  setAnswers((prev) => {
                                    const next = {
                                      ...prev,
                                      [detailId]: isDetailSelected ? "false" : "true",
                                    };
                                    // Oily and Dry are either/or — turning one on turns the other off.
                                    const opposite =
                                      EXCLUSIVE_COMBINATION_DETAILS[detail.toLowerCase()];
                                    if (!isDetailSelected && opposite) {
                                      next[`${item.id}_${opposite}`] = "false";
                                    }
                                    return pruneConcern(next);
                                  });
                                }}
                                className="px-3 py-1.5 rounded-full border"
                                style={{
                                  backgroundColor: isDetailSelected
                                    ? theme.colors.primarySoft
                                    : "#FFFFFF",
                                  borderColor: isDetailSelected
                                    ? theme.colors.primary
                                    : theme.colors.cardBorder,
                                }}
                              >
                                <Text
                                  className="text-xs font-semibold"
                                  style={{
                                    color: isDetailSelected
                                      ? theme.colors.primary
                                      : theme.colors.ink,
                                  }}
                                >
                                  {detail}
                                </Text>
                              </PressableScale>
                            );
                          })}
                        </View>
                      </Animated.View>
                    )}
                  </ClinicalCard>
                )}
                {item.id === "main_concern" && contradiction && (
                  <Animated.View entering={fadeIn} exiting={fadeOut}>
                    <Notice icon={AlertTriangle} tone="warning" copy={contradiction} />
                  </Animated.View>
                )}
                {item.type === "text" &&
                  (() => {
                    const value = answers[item.id] || "";
                    const error = value.trim() ? firstNameError(value) : null;
                    return (
                      <View className="gap-2">
                        <View
                          className="bg-white rounded-2xl px-4 py-3"
                          style={{
                            borderWidth: 1,
                            borderColor: error ? theme.colors.danger : theme.colors.cardBorder,
                          }}
                        >
                          <TextInput
                            value={value}
                            onChangeText={(text) => handleSelect(item.id, text)}
                            placeholder="Type here..."
                            className="text-gray-900"
                            placeholderTextColor={theme.colors.faint}
                            maxLength={FIRST_NAME_MAX_LENGTH + 10}
                            autoCapitalize="words"
                            autoComplete="given-name"
                            autoFocus
                          />
                        </View>
                        {error && (
                          <Text className="text-xs" style={{ color: theme.colors.danger }}>
                            {error}
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                {item.type === "date" && (
                  <ClinicalCard>
                    {Platform.OS === "ios" ? (
                      <DateTimePicker
                        value={dob ?? DOB_FALLBACK}
                        mode="date"
                        display="spinner"
                        minimumDate={MIN_DOB}
                        maximumDate={MAX_DOB}
                        onChange={(_event, selected) => {
                          if (!selected) return;
                          setDob(selected);
                          setDateTouched(true);
                          handleSelect(item.id, formatDob(selected));
                        }}
                      />
                    ) : (
                      <>
                        <PressableScale
                          onPress={() => setShowPicker(true)}
                          activeScale={0.98}
                          className="flex-row items-center gap-3 rounded-2xl py-4 px-4 border"
                          style={{
                            backgroundColor: "#FFFFFF",
                            borderColor: theme.colors.cardBorder,
                          }}
                        >
                          <View
                            className="h-9 w-9 items-center justify-center rounded-full"
                            style={{ backgroundColor: theme.colors.primarySoft }}
                          >
                            <Calendar size={18} color={theme.colors.primary} />
                          </View>
                          <Text
                            className="flex-1 font-semibold"
                            style={{ color: dob ? theme.colors.ink : theme.colors.faint }}
                          >
                            {dob ? formatDob(dob) : "Select your date of birth"}
                          </Text>
                        </PressableScale>
                        {showPicker && (
                          <DateTimePicker
                            value={dob ?? DOB_FALLBACK}
                            mode="date"
                            display="default"
                            minimumDate={MIN_DOB}
                            maximumDate={MAX_DOB}
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
                    <Text className="text-xs mt-2" style={{ color: theme.colors.muted }}>
                      You must be at least {MIN_AGE} years old to use SkinLens, as stated in our
                      Terms & Conditions.
                    </Text>
                  </ClinicalCard>
                )}
              </View>
            );
          })}
        </PagerView>
        <View className="gap-3 px-5 pb-6">
          <PrimaryButton
            label={isLastStep ? "See My Results" : "Next"}
            onPress={handleNext}
            disabled={!isAnswered}
          />
          {page !== 0 && (
            <Animated.View entering={fadeIn} exiting={fadeOut}>
              <SecondaryButton label="Back" onPress={handleBack} />
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingWrapper>
    </SafeAreaView>
  );
}
