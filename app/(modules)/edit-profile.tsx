import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import ScrollPicker from "@/components/ScrollPicker";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import profileOptions from "@/data/profile-options.json";
import {
  getAllProfiles,
  upsertLifestyleProfile,
  upsertSkinProfile,
  updateUserProfile,
} from "@/lib/db";
import { formatter } from "@/utils/formatter";

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
    <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 gap-3 mt-4">
      <Text className="text-base font-semibold text-gray-900">{title}</Text>
      {children}
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text className="text-sm text-gray-500">{label}</Text>;
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
            className={`rounded-full px-4 py-2.5 border active:opacity-80 ${
              isSelected ? "bg-green-700 border-green-700" : "bg-white border-gray-200"
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                isSelected ? "text-white" : "text-gray-700"
              }`}
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
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-50">
      <View className="flex-row items-center gap-3 px-6 pt-4 pb-1">
        <Pressable
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-white border border-gray-100 items-center justify-center active:opacity-70"
        >
          <ArrowLeft size={18} color="#15803D" />
        </Pressable>
        <View>
          <Text className="font-bold text-green-700 text-xl">Edit Profile</Text>
          <Text className="text-gray-500 text-sm">
            Update your personal and skin info
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#15803D" size="small" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-6"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <Section title="Personal Info">
            <View className="gap-1.5">
              <FieldLabel label="First Name" />
              <View className="bg-white rounded-2xl border border-gray-200 px-4">
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Your first name"
                  placeholderTextColor="#9CA3AF"
                  className="py-3 text-gray-900"
                />
              </View>
            </View>

            <View className="gap-1.5">
              <FieldLabel label="Date of Birth" />
              <View className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex-row gap-2">
                <View className="flex-1 items-center gap-1">
                  <Text className="text-xs font-semibold text-gray-500">
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
                  <Text className="text-xs font-semibold text-gray-500">
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
                  <Text className="text-xs font-semibold text-gray-500">
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

          <Pressable
            className={`rounded-full active:opacity-80 py-4 mt-5 flex-row items-center justify-center ${
              saving ? "bg-green-700/60" : "bg-green-700"
            }`}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="font-bold text-white">Save Changes</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
