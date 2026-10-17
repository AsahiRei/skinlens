import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { BackHeader, PrimaryButton, SecondaryButton } from "@/components/ui";
import { cardShadow, theme } from "@/lib/theme";
import profileOptions from "@/data/profile-options.json";
import {
  getAllProfiles,
  upsertLifestyleProfile,
  upsertSkinProfile,
  updateUserProfile,
} from "@/lib/db";
import { formatter } from "@/utils/formatter";
import { ScreenGradient } from "@/components/ScreenGradient";

const MONTHS: string[] = profileOptions.months;
const MIN_DOB = new Date(1950, 0, 1);
const DOB_FALLBACK = new Date(2000, 0, 1);

function formatDob(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function parseDob(age?: string): Date | null {
  if (!age) return null;
  const m = age.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 0 || Number.isNaN(day) || Number.isNaN(year)) return null;
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  )
    return null;
  return date;
}

const GENDER_OPTIONS: string[] = profileOptions.genders;
const SKIN_TYPE_OPTIONS: string[] = profileOptions.skinTypes;
const CONCERN_OPTIONS: string[] = profileOptions.concerns;
const SLEEP_OPTIONS: string[] = profileOptions.sleepOptions;
const STRESS_OPTIONS: string[] = profileOptions.stressOptions;
const WATER_OPTIONS: string[] = profileOptions.waterOptions;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="bg-white rounded-[20px] py-4 px-4 gap-3 mt-4" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, ...cardShadow }}>
      <Text className="text-base font-semibold" style={{ color: theme.colors.ink }}>{title}</Text>
      {children}
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text className="text-sm" style={{ color: theme.colors.muted }}>{label}</Text>;
}

function OptionChips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            className="rounded-full px-4 py-2.5 border active:opacity-80"
            style={
              isSelected
                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                : { backgroundColor: "#FFFFFF", borderColor: theme.colors.cardBorder }
            }
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: isSelected ? "#FFFFFF" : theme.colors.body }}
            >
              {formatter(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function EditProfile() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [gender, setGender] = useState("");
  const [skinType, setSkinType] = useState("");
  const [mainConcern, setMainConcern] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [stressLevel, setStressLevel] = useState("");
  const [waterIntake, setWaterIntake] = useState("");

  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(Platform.OS === "ios");
  // Whether the user picked a new DOB. An untouched picker must not
  // overwrite the saved DOB.
  const [dateTouched, setDateTouched] = useState(false);
  const [originalAge, setOriginalAge] = useState("");
  const ageString =
    dateTouched && dob ? formatDob(dob) : originalAge;

  useEffect(() => {
    (async () => {
      try {
        const { userProfile, skinProfile, lifestyleProfile } =
          await getAllProfiles();
        setFirstName(userProfile?.first_name ?? userProfile?.username ?? "");
        setGender(userProfile?.gender ?? "");
        setOriginalAge(userProfile?.age ?? "");
        const parsed = parseDob(userProfile?.age);
        if (parsed) setDob(parsed);
        setSkinType(skinProfile?.skin_type ?? "");
        setMainConcern(skinProfile?.main_concerns ?? "");
        setSleepQuality(lifestyleProfile?.sleep_quality ?? "");
        setStressLevel(lifestyleProfile?.stress_level ?? "");
        setWaterIntake(lifestyleProfile?.water_intake ?? "");
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isComplete =
    firstName.trim() &&
    gender &&
    skinType &&
    mainConcern &&
    sleepQuality &&
    stressLevel &&
    waterIntake;

  const handleSave = async () => {
    if (!isComplete) {
      ToastAndroid.show(
        "Please fill in all fields before saving.",
        ToastAndroid.SHORT,
      );
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile({
        first_name: firstName.trim(),
        age: ageString,
        gender,
      });
      await upsertSkinProfile({
        skin_type: skinType,
        main_concerns: mainConcern,
      });
      await upsertLifestyleProfile({
        sleep_quality: sleepQuality,
        stress_level: stressLevel,
        water_intake: waterIntake,
      });
      ToastAndroid.show("Profile updated", ToastAndroid.SHORT);
      router.back();
    } catch (err) {
      console.error("Error saving profile:", err);
      ToastAndroid.show(
        "Failed to save changes. Please try again.",
        ToastAndroid.SHORT,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <FadeItem index={0}>
        <View className="px-5 pt-4 pb-1 mt-2">
          <BackHeader
            title="Edit Profile"
            subtitle="Update your personal and skin info"
            onBack={() => router.back()}
          />
        </View>
      </FadeItem>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.colors.primary} size="small" />
        </View>
      ) : (
        <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          <FadeItem index={1}>
            <Section title="Personal Info">
              <View className="gap-1.5">
                <FieldLabel label="First Name" />
                <View className="bg-white rounded-2xl px-4" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Your first name"
                    placeholderTextColor={theme.colors.faint}
                    className="py-3" style={{ color: theme.colors.ink }}
                  />
                </View>
              </View>

              <View className="gap-1.5">
                <FieldLabel label="Date of Birth" />
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
                    }}
                  />
                ) : (
                  <>
                    <Pressable
                      onPress={() => setShowPicker(true)}
                      className="flex-row items-center gap-3 rounded-2xl py-4 px-4 border active:opacity-90"
                      style={{ backgroundColor: "#FFFFFF", borderColor: theme.colors.cardBorder }}
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
                        {dob ? formatDob(dob) : originalAge || "Select your date of birth"}
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
                          }
                          setShowPicker(false);
                        }}
                      />
                    )}
                  </>
                )}
              </View>

              <View className="gap-1.5">
                <FieldLabel label="Gender" />
                <OptionChips
                  options={GENDER_OPTIONS}
                  value={gender}
                  onChange={setGender}
                />
              </View>
            </Section>
          </FadeItem>

          <FadeItem index={2}>
            <Section title="Skin Profile">
              <View className="gap-1.5">
                <FieldLabel label="Skin Type" />
                <OptionChips
                  options={SKIN_TYPE_OPTIONS}
                  value={skinType}
                  onChange={setSkinType}
                />
              </View>
              <View className="gap-1.5">
                <FieldLabel label="Primary Concern" />
                <OptionChips
                  options={CONCERN_OPTIONS}
                  value={mainConcern}
                  onChange={setMainConcern}
                />
              </View>
            </Section>
          </FadeItem>

          <FadeItem index={3}>
            <Section title="Lifestyle">
              <View className="gap-1.5">
                <FieldLabel label="Sleep Quality" />
                <OptionChips
                  options={SLEEP_OPTIONS}
                  value={sleepQuality}
                  onChange={setSleepQuality}
                />
              </View>
              <View className="gap-1.5">
                <FieldLabel label="Stress Level" />
                <OptionChips
                  options={STRESS_OPTIONS}
                  value={stressLevel}
                  onChange={setStressLevel}
                />
              </View>
              <View className="gap-1.5">
                <FieldLabel label="Water Intake" />
                <OptionChips
                  options={WATER_OPTIONS}
                  value={waterIntake}
                  onChange={setWaterIntake}
                />
              </View>
            </Section>
          </FadeItem>

          <FadeItem index={4}>
            <View className="mt-5">
              <PrimaryButton
                label={saving ? "Please wait…" : "Save Changes"}
                onPress={handleSave}
                disabled={saving}
              />
            </View>
          </FadeItem>

          <FadeItem index={5}>
            <View className="mt-3">
              <SecondaryButton
                label="Update Face Recognition"
                onPress={() =>
                  router.push({
                    pathname: "/(user-setup)/face-enroll",
                    params: { mode: "reenroll" },
                  })
                }
              />
            </View>
          </FadeItem>
        </KeyboardAwareScroll>
      )}
    </SafeAreaView>
  );
}
