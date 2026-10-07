import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import ScrollPicker from "@/components/ScrollPicker";
import { FadeItem } from "@/components/FadeItem";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
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
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1949 }, (_, i) => String(CURRENT_YEAR - i));

const GENDER_OPTIONS: string[] = profileOptions.genders;
const SKIN_TYPE_OPTIONS: string[] = profileOptions.skinTypes;
const CONCERN_OPTIONS: string[] = profileOptions.concerns;
const SLEEP_OPTIONS: string[] = profileOptions.sleepOptions;
const STRESS_OPTIONS: string[] = profileOptions.stressOptions;
const WATER_OPTIONS: string[] = profileOptions.waterOptions;

function parseAge(age?: string): { month: number; day: number; year: number } | null {
  if (!age) return null;
  const m = age.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  const day = DAYS.indexOf(String(Number(m[2])));
  const year = YEARS.indexOf(m[3]);
  if (month < 0 || day < 0 || year < 0) return null;
  return { month, day, year };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="bg-white rounded-[20px] py-4 px-4 gap-3 mt-4" style={{ borderWidth: 1, borderColor: "#E5EDE8", ...cardShadow }}>
      <Text className="text-base font-semibold" style={{ color: "#10241A" }}>{title}</Text>
      {children}
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text className="text-sm" style={{ color: "#6B7280" }}>{label}</Text>;
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
                : { backgroundColor: "#FFFFFF", borderColor: "#E5EDE8" }
            }
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: isSelected ? "#FFFFFF" : "#3F4A44" }}
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

  const [dateValues, setDateValues] = useState({ month: 0, day: 0, year: 0 });
  // Whether the user touched the DOB wheels. Untouched wheels visually show
  // January 1 of the current year but must not overwrite the saved DOB.
  const [dateTouched, setDateTouched] = useState(false);
  const [originalAge, setOriginalAge] = useState("");
  const ageString = dateTouched
    ? `${MONTHS[dateValues.month]} ${DAYS[dateValues.day]}, ${YEARS[dateValues.year]}`
    : originalAge;

  useEffect(() => {
    (async () => {
      try {
        const { userProfile, skinProfile, lifestyleProfile } =
          await getAllProfiles();
        setFirstName(userProfile?.first_name ?? userProfile?.username ?? "");
        setGender(userProfile?.gender ?? "");
        setOriginalAge(userProfile?.age ?? "");
        const parsed = parseAge(userProfile?.age);
        if (parsed) setDateValues(parsed);
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
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
      <ScreenGradient />
      <FadeItem index={0}>
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-1 mt-2">
          <Pressable
            onPress={() => router.back()}
            className="w-9 h-9 rounded-full bg-white items-center justify-center active:opacity-70"
            style={{ borderWidth: 1, borderColor: "#E5EDE8" }}
          >
            <ArrowLeft size={18} color="#15803D" />
          </Pressable>
          <View>
            <Text className="font-bold text-[20px]" style={{ color: "#10241A" }}>Edit Profile</Text>
            <Text className="text-sm" style={{ color: "#6B7280" }}>
              Update your personal and skin info
            </Text>
          </View>
        </View>
      </FadeItem>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#15803D" size="small" />
        </View>
      ) : (
        <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          <FadeItem index={1}>
            <Section title="Personal Info">
              <View className="gap-1.5">
                <FieldLabel label="First Name" />
                <View className="bg-white rounded-2xl px-4" style={{ borderWidth: 1, borderColor: "#E5EDE8" }}>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Your first name"
                    placeholderTextColor="#9CA3AF"
                    className="py-3 text-[#10241A]"
                  />
                </View>
              </View>

              <View className="gap-1.5">
                <FieldLabel label="Date of Birth" />
                <View className="rounded-xl p-3 flex-row gap-2" style={{ backgroundColor: "#F4F7F5", borderWidth: 1, borderColor: "#E5EDE8" }}>
                  <View className="flex-1 items-center gap-1">
                    <Text className="text-xs font-semibold" style={{ color: "#6B7280" }}>
                      Month
                    </Text>
                    <ScrollPicker
                      items={MONTHS}
                      selectedIndex={dateValues.month}
                      onValueChange={(idx) => {
                        setDateValues((prev) => ({ ...prev, month: idx }));
                        setDateTouched(true);
                      }}
                    />
                  </View>
                  <View className="flex-1 items-center gap-1">
                    <Text className="text-xs font-semibold" style={{ color: "#6B7280" }}>
                      Day
                    </Text>
                    <ScrollPicker
                      items={DAYS}
                      selectedIndex={dateValues.day}
                      onValueChange={(idx) => {
                        setDateValues((prev) => ({ ...prev, day: idx }));
                        setDateTouched(true);
                      }}
                    />
                  </View>
                  <View className="flex-1 items-center gap-1">
                    <Text className="text-xs font-semibold" style={{ color: "#6B7280" }}>
                      Year
                    </Text>
                    <ScrollPicker
                      items={YEARS}
                      selectedIndex={dateValues.year}
                      onValueChange={(idx) => {
                        setDateValues((prev) => ({ ...prev, year: idx }));
                        setDateTouched(true);
                      }}
                    />
                  </View>
                </View>
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
