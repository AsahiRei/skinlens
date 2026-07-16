import { ActivityIndicator } from "react-native";
import { useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { generateRoutine } from "@/utils/routine-generator";
import { supabase } from "@/utils/supabase";
import { profileSetup } from "@/data/profile-setup";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";

export default function ComponentName() {
  let totalPoints = 0;
  let maxPoints = 0;
  const { answers } = useLocalSearchParams<{ answers: string }>();
  const data = JSON.parse(answers);
  const router = useRouter();
  console.log(data);
  //health score calculation
  profileSetup.forEach((question) => {
    if (!question.options) return;
    maxPoints += Math.max(...question.options.map((o) => o.points ?? 0));
    const selected = data[question.id];
    const option = question.options.find((o) => o.value === selected);
    totalPoints += option?.points ?? 0;
  });
  const healthScore = Math.round((totalPoints / maxPoints) * 100);
  useEffect(() => {
    const processing = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        //user profiles
        const { error: insertUserProfilesError } = await supabase
          .from("user_profiles")
          .upsert({
            name: data.name,
            phone_number: data.phone_number,
            age: data.age,
            gender: data.gender,
            users_setup: true,
          })
          .eq("id", user?.id);
        if (insertUserProfilesError) {
          console.error(insertUserProfilesError.message);
          return;
        }
        //skin profiles
        const { error: insertSkinProfilesError } = await supabase
          .from("skin_profiles")
          .upsert({
            id: user?.id,
            skin_type: data.skin_type,
            main_concern: data.main_concern,
          });
        if (insertSkinProfilesError) {
          console.error(insertSkinProfilesError.message);
          return;
        }
        //lifestyle profiles
        const { error: insertLifestyleProfilesError } = await supabase
          .from("lifestyle_profiles")
          .upsert({
            id: user?.id,
            sleep_quality: data.sleep_quality,
            stress_level: data.stress_level,
            water_intake: data.water_intake,
          });
        if (insertLifestyleProfilesError) {
          console.error(insertLifestyleProfilesError.message);
          return;
        }
        //skin scans
        const { data: skinScanData, error: insertSkinScans } = await supabase
          .from("skin_scans")
          .insert({
            scan_type: "questionnaire",
            health_score: healthScore,
            prediction: "",
            confidence: 0,
            original_url: 0,
            heatmap_url: 0,
            users_id: user?.id,
          })
          .select()
          .single();
        if (insertSkinScans) {
          console.error(insertSkinScans.message);
          return;
        }
        //routines
        const res = await generateRoutine({
          skin_type: data.skin_type,
          main_concern: data.main_concern,
          sleep_quality: data.sleep_quality,
          stress_level: data.stress_level,
          water_intake: data.water_intake,
          prediction: "",
          confidence: 0,
          health_score: 0,
        });
        if (res.error) {
          console.error(res.error.message);
          return;
        }
        const { error: insertRoutineError } = await supabase
          .from("routines")
          .insert({
            skin_scan_id: skinScanData?.id,
            users_id: user?.id,
            source: "ai",
            morning: res.morning,
            afternoon: res.afternoon,
            evening: res.evening,
            tips: res.tips,
          });
        if (insertRoutineError) {
          console.error(insertRoutineError.message);
          return;
        }
        console.log(res);
        console.log(res.morning);
        console.log(res.afternoon);
        console.log(res.evening);
        console.log(res.tips);
      } catch (error) {
        console.error(error);
      } finally {
        router.replace({
          pathname: "/(user)/results",
          params: {
            healthScore: healthScore,
            answers,
          },
        });
      }
    };
    processing();
  }, [
    answers,
    data.age,
    data.gender,
    data.main_concern,
    data.name,
    data.phone_number,
    data.skin_type,
    data.sleep_quality,
    data.stress_level,
    data.water_intake,
    healthScore,
    router,
  ]);
  return (
    <SafeAreaView className="items-center justify-center flex-1 bg-white">
      <ActivityIndicator size="large" color="#15803d" />
    </SafeAreaView>
  );
}
