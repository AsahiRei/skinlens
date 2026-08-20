import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  Pressable,
} from "react-native";
import { useState, useEffect } from "react";
import Ionicons from "@react-native-vector-icons/ionicons";
import { supabase } from "@/utils/supabase";
import { InfoCard, InfoCardSkeleton } from "@/components/Info";
import { formatter } from "@/utils/formatter";
import LogoutModal from "@/components/LogoutModal";
import Skeleton from "@/components/Skeleton";

type UserProfile = {
  username: string;
  email: string;
  age: string;
  phone_number: string;
  created_at: any;
};

type SkinProfile = {
  skin_type: string;
  main_concerns: string;
};

type LifestyleProfile = {
  sleep_quality: string;
  water_intake: string;
  stress_level: string;
};

export default function Profile() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [skinProfile, setSkinProfile] = useState<SkinProfile | null>(null);
  const [lifestyleProfile, setLifestyleProfile] =
    useState<LifestyleProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingSkin, setLoadingSkin] = useState(true);
  const [loadingLifestyle, setLoadingLifestyle] = useState(true);
  const [logoutModal, setLogoutModal] = useState(false);
  useEffect(() => {
    //user profile
    const fetchUserProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("user_profile")
          .select("*")
          .eq("id", user?.id)
          .single();
        if (error) throw error;
        setUserProfile(data);
      } catch (err) {
        console.error("Error fetching user profile:", err);
      } finally {
        setLoadingUser(false);
      }
    };
    //skin profile
    const fetchSkinProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("skin_profile")
          .select("*")
          .eq("id", user?.id)
          .single();
        if (error) throw error;
        setSkinProfile(data);
      } catch (err) {
        console.error("Error fetching skin profile:", err);
      } finally {
        setLoadingSkin(false);
      }
    };
    //life style profile
    const fetchLifestyleProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("lifestyle_profile")
          .select("*")
          .eq("id", user?.id)
          .single();
        if (error) throw error;
        setLifestyleProfile(data);
      } catch (err) {
        console.error("Error fetching skin profile:", err);
      } finally {
        setLoadingLifestyle(false);
      }
    };
    fetchLifestyleProfile();
    fetchUserProfile();
    fetchSkinProfile();
  }, []);
  return (
    <>
      <LogoutModal isVisible={logoutModal} setVisible={setLogoutModal} />
      <View className="flex-1">
        <View className="bg-green-800 px-6 pt-12 pb-4">
          {loadingUser ? (
            <>
              <Skeleton className="h-7 w-40 mb-2" />
              <Skeleton className="h-4 w-48 mb-3" />
              <Skeleton className="h-6 w-44 rounded-xl" />
            </>
          ) : (
            <>
              <Text className="font-bold text-white text-2xl">
                {userProfile?.username}
              </Text>
              <Text className="text-gray-200">{userProfile?.email}</Text>
              <View className="bg-white/30 rounded-xl mt-2 self-start px-4 py-1">
                <Text className="text-sm font-bold text-white">
                  Member since{" "}
                  {userProfile?.created_at
                    ? new Date(userProfile.created_at).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )
                    : ""}
                </Text>
              </View>
            </>
          )}
        </View>
        <ScrollView
          className="flex-1 bg-gray-50 px-6 py-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full rounded-4xl border border-gray-200 bg-white p-5 gap-2">
            <Text className="text-base font-semibold text-gray-900">
              Skin Profile
            </Text>
            <View className="gap-3">
              <View className="flex-row gap-3">
                {loadingSkin ? (
                  <>
                    <InfoCardSkeleton />
                    <InfoCardSkeleton />
                  </>
                ) : (
                  <>
                    <InfoCard
                      label="Skin Type"
                      value={formatter(skinProfile?.skin_type || "") ?? "—"}
                    />
                    <InfoCard
                      label="Primary Concern"
                      value={formatter(skinProfile?.main_concerns || "") ?? "—"}
                    />
                  </>
                )}
              </View>
            </View>
          </View>
          <View className="w-full rounded-4xl border border-gray-200 bg-white p-5 mt-4">
            <Text className="text-base font-semibold text-gray-900 mb-1">
              Lifestyle Info
            </Text>
            {loadingLifestyle ? (
              <>
                <View className="flex-row items-center py-3 border-b border-gray-100">
                  <Skeleton className="w-10 h-10 rounded-full mr-3" />
                  <View className="flex-1 gap-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </View>
                </View>
                <View className="flex-row items-center py-3 border-b border-gray-100">
                  <Skeleton className="w-10 h-10 rounded-full mr-3" />
                  <View className="flex-1 gap-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </View>
                </View>
                <View className="flex-row items-center py-3">
                  <Skeleton className="w-10 h-10 rounded-full mr-3" />
                  <View className="flex-1 gap-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </View>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => {
                    // navigate to sleep detail
                  }}
                  className="flex-row items-center py-3 border-b border-gray-100"
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "#F3E8FF" }}
                  >
                    <Ionicons name="moon" size={18} color="#7C3AED" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm text-gray-400">Sleep Quality</Text>
                    <Text className="text-base font-bold text-gray-900">
                      {formatter(lifestyleProfile?.sleep_quality || "") ?? "—"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => {
                    // navigate to water intake detail
                  }}
                  className="flex-row items-center py-3 border-b border-gray-100"
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "#DBEAFE" }}
                  >
                    <Ionicons name="water" size={18} color="#2563EB" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm text-gray-400">Water Intake</Text>
                    <Text className="text-base font-bold text-gray-900">
                      {formatter(lifestyleProfile?.water_intake || "") ?? "—"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => {
                    // navigate to stress level detail
                  }}
                  className="flex-row items-center py-3"
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "#FFEDD5" }}
                  >
                    <Ionicons name="pulse" size={18} color="#EA580C" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm text-gray-400">Stress Level</Text>
                    <Text className="text-base font-bold text-gray-900">
                      {formatter(lifestyleProfile?.stress_level || "") ?? "—"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                </TouchableOpacity>
              </>
            )}
          </View>
          <View className="w-full rounded-4xl border border-gray-200 bg-white p-5 mt-4">
            <Text className="text-base font-semibold text-gray-900 mb-1">
              Notifications
            </Text>
            <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
              <View className="flex-col">
                <Text className="text-base font-semibold text-gray-900">
                  Scan Reminders
                </Text>
                <Text className="text-sm text-gray-400">
                  Weekly skin check reminders
                </Text>
              </View>
              <Switch />
            </View>
            <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
              <View className="flex-col">
                <Text className="text-base font-semibold text-gray-900">
                  Appointment Alerts
                </Text>
                <Text className="text-sm text-gray-400">
                  Upcoming appointment notifications
                </Text>
              </View>
              <Switch />
            </View>
            <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
              <View className="flex-col">
                <Text className="text-base font-semibold text-gray-900">
                  Daily Skincare Tips
                </Text>
                <Text className="text-sm text-gray-400">
                  Personalized tips & advice
                </Text>
              </View>
              <Switch />
            </View>
          </View>
          <Pressable
            className="bg-red-700 active:opacity-80 py-4 mt-4 rounded-full"
            onPress={() => setLogoutModal(true)}
          >
            <Text className="font-bold text-white text-center">Logout</Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}
