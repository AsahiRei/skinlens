import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Moon,
  Droplets,
  Activity,
  ChevronRight,
  LogOut,
  Pencil,
  ShieldAlert,
} from "lucide-react-native";

import { InfoCard, InfoCardSkeleton } from "@/components/Info";
import LogoutModal from "@/components/LogoutModal";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useFocusTrigger } from "@/hooks/useFocusTrigger";
import { useNotifications } from "@/hooks/useNotifications";
import { getAllProfiles, getSensitivityHistory, updateUserProfile } from "@/lib/db";
import type {
  LifestyleProfile,
  SensitivityEntry,
  SkinProfile,
  UserProfile,
} from "@/types/schema";
import { uploadImageToCloudinary } from "@/utils/cloudinary";
import { formatter } from "@/utils/formatter";

export default function Profile() {
  const router = useRouter();
  const { settings, updateSettings } = useNotifications();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [skinProfile, setSkinProfile] = useState<SkinProfile | null>(null);
  const [lifestyleProfile, setLifestyleProfile] =
    useState<LifestyleProfile | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityEntry[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingSkin, setLoadingSkin] = useState(true);
  const [loadingLifestyle, setLoadingLifestyle] = useState(true);
  const [logoutModal, setLogoutModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const focusTrigger = useFocusTrigger();
  const fetchProfiles = async () => {
    try {
      const { userProfile, skinProfile, lifestyleProfile } =
        await getAllProfiles();
      setUserProfile(userProfile);
      setSkinProfile(skinProfile);
      setLifestyleProfile(lifestyleProfile);
      setSensitivity(await getSensitivityHistory());
    } catch (err) {
      console.error("Error fetching profiles:", err);
    } finally {
      setLoadingUser(false);
      setLoadingSkin(false);
      setLoadingLifestyle(false);
    }
  };
  useEffect(() => {
    // Fetch-on-focus effect: setState happens in async continuations after
    // awaits, not synchronously — the extra render pass is inherent to loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProfiles();
  }, [focusTrigger]);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchProfiles();
    } finally {
      setRefreshing(false);
    }
  };

  const goEdit = () => router.push("/(modules)/edit-profile");
  const latestSensitivity = sensitivity[0];
  const displayName = userProfile?.first_name || userProfile?.username || "";
  const avatarInitial = (displayName || userProfile?.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const saveAvatar = async (localUri: string) => {
    setAvatarUploading(true);
    try {
      const cloudUrl = await uploadImageToCloudinary(localUri, 2, "skinlens/avatars");
      // Offline: keep the local file URI so the picture still shows; the
      // Cloudinary URL replaces it on next sync-covered save.
      const avatarUrl = cloudUrl ?? localUri;
      await updateUserProfile({ face_image_url: avatarUrl });
      setUserProfile((prev) => (prev ? { ...prev, face_image_url: avatarUrl } : prev));
      ToastAndroid.show("Profile picture updated", ToastAndroid.SHORT);
    } catch (err) {
      console.error("Avatar save failed:", err);
      ToastAndroid.show("Couldn't update picture. Try again.", ToastAndroid.SHORT);
    } finally {
      setAvatarUploading(false);
    }
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow photo library access to choose a picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      await saveAvatar(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow camera access to take a picture.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      await saveAvatar(result.assets[0].uri);
    }
  };

  const handleAvatarPress = () => {
    Alert.alert("Profile picture", "Choose a new profile picture", [
      { text: "Gallery", onPress: () => void pickFromGallery() },
      { text: "Camera", onPress: () => void takePhoto() },
      ...(userProfile?.face_image_url
        ? [
            {
              text: "Remove",
              style: "destructive" as const,
              onPress: () =>
                void (async () => {
                  await updateUserProfile({ face_image_url: null });
                  setUserProfile((prev) =>
                    prev ? { ...prev, face_image_url: null } : prev,
                  );
                })(),
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  return (
    <>
      <LogoutModal isVisible={logoutModal} setVisible={setLogoutModal} />
      <SafeAreaView edges={["top"]} className="flex-1 bg-gray-50">
        <ScrollView
          className="flex-1 px-6"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#15803D"
              colors={["#15803D"]}
            />
          }
        >
          {/* Header */}
          {loadingUser ? (
            <View className="gap-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-44 mt-1" />
            </View>
          ) : (
            <View>
              <View className="flex-row items-start justify-between">
                <View>
                  <Text className="font-bold text-green-700 text-2xl">
                    My Profile
                  </Text>
                  <Text className="text-gray-500">Your personal profile</Text>
                </View>
                <Pressable
                  onPress={goEdit}
                  className="flex-row items-center gap-1.5 bg-white border border-gray-100 rounded-full px-3.5 py-2 active:opacity-70"
                >
                  <Pencil size={14} color="#15803D" />
                  <Text className="text-sm font-bold text-green-700">Edit</Text>
                </Pressable>
              </View>
              <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 flex-col mt-4">
                <View className="flex-row items-center gap-4">
                  <Pressable
                    onPress={handleAvatarPress}
                    accessibilityRole="button"
                    accessibilityLabel="Change profile picture"
                    className="active:opacity-80"
                  >
                    <View>
                      {userProfile?.face_image_url ? (
                        <Image
                          source={{ uri: userProfile.face_image_url }}
                          className="h-20 w-20 rounded-full bg-gray-100"
                        />
                      ) : (
                        <View className="h-20 w-20 rounded-full bg-green-700 items-center justify-center">
                          <Text className="text-3xl font-bold text-white">
                            {avatarInitial}
                          </Text>
                        </View>
                      )}
                      <View className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white border border-gray-100 items-center justify-center">
                        {avatarUploading ? (
                          <ActivityIndicator size="small" color="#15803D" />
                        ) : (
                          <Camera size={14} color="#15803D" />
                        )}
                      </View>
                    </View>
                  </Pressable>
                  <View className="flex-1">
                    <Text className="text-gray-700 mt-0.5 text-xl font-semibold">
                      {displayName}
                    </Text>
                    <Text className="text-gray-500 text-sm mt-0.5">
                      {userProfile?.email}
                    </Text>
                  </View>
                </View>
                <View className="bg-green-50 rounded-full mt-2 self-start px-3 py-1">
                  <Text className="text-xs font-semibold text-green-700">
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
                <View className="flex-row gap-3 mt-3">
                  <InfoCard
                    label="Date of Birth"
                    value={userProfile?.age || "—"}
                  />
                  <InfoCard
                    label="Gender"
                    value={
                      userProfile?.gender
                        ? formatter(userProfile.gender)
                        : "—"
                    }
                  />
                </View>
              </View>
            </View>
          )}

          {/* Skin profile */}
          {loadingSkin ? (
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 flex-col gap-3 mt-5">
              <Skeleton className="h-5 w-28" />
              <View className="flex-row gap-3">
                <InfoCardSkeleton />
                <InfoCardSkeleton />
              </View>
            </View>
          ) : (
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 flex-col gap-3 mt-5">
              <Text className="text-base font-semibold text-gray-900">
                Skin Profile
              </Text>
              <View className="gap-3">
                <View className="flex-row gap-3">
                  <InfoCard
                    label="Skin Type"
                    value={formatter(skinProfile?.skin_type || "") || "—"}
                  />
                  <InfoCard
                    label="Primary Concern"
                    value={formatter(skinProfile?.main_concerns || "") || "—"}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Lifestyle info */}
          {loadingLifestyle ? (
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 flex-col gap-3 mt-4">
              <Skeleton className="h-5 w-28 mb-1" />
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  className={`flex-row items-center py-3 ${
                    i < 2 ? "border-b border-gray-100" : ""
                  }`}
                >
                  <Skeleton className="w-10 h-10 rounded-full mr-3" />
                  <View className="flex-1 gap-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 flex-col gap-3 mt-4">
              <Text className="text-base font-semibold text-gray-900 mb-1">
                Lifestyle Info
              </Text>
              <View className="flex-row items-center py-3 border-b border-gray-100">
                <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-green-50">
                  <Moon size={18} color="#15803D" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-gray-400">Sleep Quality</Text>
                  <Text className="text-base font-bold text-gray-900">
                    {formatter(lifestyleProfile?.sleep_quality || "") || "—"}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center py-3 border-b border-gray-100">
                <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-green-50">
                  <Droplets size={18} color="#15803D" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-gray-400">Water Intake</Text>
                  <Text className="text-base font-bold text-gray-900">
                    {formatter(lifestyleProfile?.water_intake || "") || "—"}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center py-3">
                <View className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-green-50">
                  <Activity size={18} color="#15803D" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-gray-400">Stress Level</Text>
                  <Text className="text-base font-bold text-gray-900">
                    {formatter(lifestyleProfile?.stress_level || "") || "—"}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Sensitivity history */}
          <TouchableOpacity
            onPress={() => router.push("/(modules)/sensitivity")}
            activeOpacity={0.7}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 mt-4"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1 pr-2">
                <View className="w-10 h-10 rounded-full items-center justify-center bg-green-50">
                  <ShieldAlert size={18} color="#15803D" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900">
                    Skin Sensitivity
                  </Text>
                  <Text className="text-sm text-gray-500">
                    {latestSensitivity
                      ? `${formatter(latestSensitivity.severity)} · ${formatter(latestSensitivity.trigger_cause)}`
                      : "No episodes logged yet"}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-1.5">
                {sensitivity.length > 0 && (
                  <View className="bg-green-50 rounded-full px-2.5 py-1">
                    <Text className="text-xs font-bold text-green-700">
                      {sensitivity.length}
                    </Text>
                  </View>
                )}
                <ChevronRight size={18} color="#D1D5DB" />
              </View>
            </View>
          </TouchableOpacity>

          {/* Notifications */}
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm py-4 px-4 flex-col gap-3 mt-4">
            <Text className="text-base font-semibold text-gray-900 mb-1">
              Notifications
            </Text>
            <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
              <View className="flex-col flex-1 pr-3">
                <Text className="text-base font-semibold text-gray-900">
                  Scan Reminders
                </Text>
                <Text className="text-sm text-gray-400">
                  Weekly skin check reminders
                </Text>
              </View>
              <Switch
                value={settings.scanReminders}
                onValueChange={(val) => updateSettings({ scanReminders: val })}
                trackColor={{ false: "#E5E7EB", true: "#15803D" }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View className="flex-row items-center justify-between py-3">
              <View className="flex-col flex-1 pr-3">
                <Text className="text-base font-semibold text-gray-900">
                  Daily Skincare Tips
                </Text>
                <Text className="text-sm text-gray-400">
                  Personalized tips & advice
                </Text>
              </View>
              <Switch
                value={settings.dailyTips}
                onValueChange={(val) => updateSettings({ dailyTips: val })}
                trackColor={{ false: "#E5E7EB", true: "#15803D" }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <Pressable
            className="bg-red-600 active:opacity-80 py-4 mt-5 rounded-full flex-row items-center justify-center gap-2"
            accessibilityRole="button"
            accessibilityLabel="Logout"
            onPress={() => setLogoutModal(true)}
          >
            <LogOut size={18} color="#FFFFFF" />
            <Text className="font-bold text-white text-center">Logout</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
