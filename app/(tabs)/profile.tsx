import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import {
  ChevronRight,
  LogOut,
  Pencil,
  ScanFace,
  ShieldCheck,
  TriangleAlert,
  UserRoundSearch,
} from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { LinearGradient } from "expo-linear-gradient";
import { InfoCard, InfoCardSkeleton } from "@/components/Info";
import LogoutModal from "@/components/LogoutModal";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import {
  CardTitleSkeleton,
  HeroTextSkeleton,
  IconRowsSkeleton,
} from "@/components/ProfileSkeletons";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { CoachTarget, useTutorial } from "@/components/TutorialCoach";
import { ScreenHeader, UiModal, ClinicalCard, Pill, SectionTitle } from "@/components/ui";
import { theme, cardShadow } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import { useFocusTrigger } from "@/hooks/useFocusTrigger";
import { useCoachScroller } from "@/hooks/useCoachScroller";
import { useNotifications } from "@/hooks/useNotifications";
import { getAllProfiles, updateUserProfile } from "@/lib/db";
import {
  getMyProfileValidation,
  type ProfileValidation,
} from "@/lib/db/profile-review";
import type {
  LifestyleProfile,
  SkinProfile,
  UserProfile,
} from "@/types/schema";
import { formatter } from "@/utils/formatter";
import { ScreenGradient } from "@/components/ScreenGradient";

export default function Profile() {
  const router = useRouter();
  const { startTutorial } = useTutorial();
  const { settings, updateSettings } = useNotifications();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [skinProfile, setSkinProfile] = useState<SkinProfile | null>(null);
  const [lifestyleProfile, setLifestyleProfile] =
    useState<LifestyleProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingSkin, setLoadingSkin] = useState(true);
  const [loadingLifestyle, setLoadingLifestyle] = useState(true);
  const [logoutModal, setLogoutModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  // undefined = unknown (offline / not migrated) → card hidden;
  // null = never reviewed.
  const [validation, setValidation] = useState<
    ProfileValidation | null | undefined
  >(undefined);
  const focusTrigger = useFocusTrigger();
  // Replaying from this screen leaves it scrolled down where the Replay
  // button lives — the tutorial needs to scroll its target back into view.
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, scrollIntoView } = useCoachScroller(scrollRef);
  const fetchProfiles = async () => {
    try {
      const { userProfile, skinProfile, lifestyleProfile } =
        await getAllProfiles();
      setUserProfile(userProfile);
      setSkinProfile(skinProfile);
      setLifestyleProfile(lifestyleProfile);
    } catch (err) {
      console.error("Error fetching profiles:", err);
    } finally {
      setLoadingUser(false);
      setLoadingSkin(false);
      setLoadingLifestyle(false);
    }
    try {
      setValidation(await getMyProfileValidation());
    } catch {
      // Offline or 0012 not applied — keep whatever we showed last.
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
  const displayName = userProfile?.first_name || userProfile?.username || "";
  const avatarInitial = (displayName || userProfile?.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const handleAvatarPress = () => {
    setPickerVisible(true);
  };

  const handleRemoveAvatar = async () => {
    setPickerVisible(false);
    // Avatar and face record are one row — clear both together.
    await updateUserProfile({ face_image_url: null, face_embedding: null });
    setUserProfile((prev) =>
      prev ? { ...prev, face_image_url: null, face_embedding: null } : prev,
    );
  };

  return (
    <>
      <LogoutModal isVisible={logoutModal} setVisible={setLogoutModal} />
      <DeleteAccountModal isVisible={deleteModal} setVisible={setDeleteModal} />
      <UiModal
        visible={pickerVisible}
        onDismiss={() => setPickerVisible(false)}
        title="Profile picture"
        actions={[
          {
            label: "Take new picture",
            onPress: () => {
              setPickerVisible(false);
              router.push({
                pathname: "/(user-setup)/face-enroll",
                params: { mode: "reenroll" },
              });
            },
          },
          ...(userProfile?.face_image_url
            ? [
                {
                  label: "Remove",
                  kind: "danger" as const,
                  onPress: () => void handleRemoveAvatar(),
                },
              ]
            : []),
          { label: "Cancel", kind: "ghost", onPress: () => setPickerVisible(false) },
        ]}
      />
      <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
          onScroll={onScroll}
          scrollEventThrottle={32}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        >
          {/* Header */}
          <FadeItem index={0}>
            {loadingUser ? (
              <HeroTextSkeleton />
            ) : (
              <View className="mt-2">
                <View className="flex-row items-start justify-between">
                  <ScreenHeader
                    title="My Profile"
                    subtitle="Personal and skin details"
                  />
                  <Pressable
                    onPress={goEdit}
                    className="flex-row items-center gap-1.5 bg-white rounded-full px-3.5 py-2 active:opacity-70"
                    style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
                  >
                    <Pencil size={14} color={theme.colors.primary} />
                    <Text className="text-sm font-bold" style={{ color: theme.colors.primary }}>Edit</Text>
                  </Pressable>
                </View>
                <CoachTarget id="profile.card" scrollIntoView={scrollIntoView}>
                <LinearGradient
                  colors={[...theme.gradients.dark]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  className="flex-col mt-4 px-4 py-4"
                  style={{ borderRadius: theme.radius.card, ...cardShadow }}
                >
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
                            className="h-20 w-20 rounded-full"
                          style={{ backgroundColor: theme.colors.primarySoft }}
                          />
                        ) : (
                          <LinearGradient
                            colors={[...theme.gradients.icon]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                              height: 80,
                              width: 80,
                              borderRadius: 999,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text className="text-3xl font-bold text-white">
                              {avatarInitial}
                            </Text>
                          </LinearGradient>
                        )}
                        <LinearGradient
                          colors={[...theme.gradients.icon]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{
                            position: "absolute",
                            bottom: -4,
                            right: -4,
                            height: 28,
                            width: 28,
                            borderRadius: 999,
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 2,
                            borderColor: "#FFFFFF",
                          }}
                        >
                          <ScanFace size={14} color="#FFFFFF" />
                        </LinearGradient>
                      </View>
                    </Pressable>
                    <View className="flex-1">
                      <Text className="font-semibold mt-0.5 text-xl" style={{ color: "#FFFFFF" }}>
                        {displayName}
                      </Text>
                      <Text className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.8)" }}>
                        {userProfile?.email}
                      </Text>
                    </View>
                  </View>
                  <View className="mt-2 self-start">
                    <Pill
                      label={`Member since ${
                        userProfile?.created_at
                          ? new Date(userProfile.created_at).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              },
                            )
                          : ""
                      }`}
                    />
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
                </LinearGradient>
                </CoachTarget>
              </View>
            )}
          </FadeItem>

          {/* Skin profile */}
          <FadeItem index={1}>
            {loadingSkin ? (
              <ClinicalCard className="flex-col gap-3 mt-5">
                <CardTitleSkeleton />
                <View className="flex-row gap-3">
                  <InfoCardSkeleton />
                  <InfoCardSkeleton />
                </View>
              </ClinicalCard>
            ) : (
              <ClinicalCard className="flex-col gap-3 mt-5">
                <SectionTitle title="Skin Profile" />
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
              </ClinicalCard>
            )}
          </FadeItem>

          {/* Lifestyle info */}
          <FadeItem index={2}>
            {loadingLifestyle ? (
              <ClinicalCard className="flex-col gap-3 mt-4">
                <CardTitleSkeleton className="mb-1" />
                <IconRowsSkeleton rows={3} />
              </ClinicalCard>
            ) : (
              <ClinicalCard className="flex-col gap-3 mt-4">
                <SectionTitle title="Lifestyle Info" />
                <View className="flex-row items-center py-3 border-b" style={{ borderBottomColor: theme.colors.divider }}>
                  <View className="flex-1">
                    <Text className="text-sm" style={{ color: theme.colors.faint }}>Sleep Quality</Text>
                    <Text className="text-base font-bold" style={{ color: theme.colors.ink }}>
                      {formatter(lifestyleProfile?.sleep_quality || "") || "—"}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center py-3 border-b" style={{ borderBottomColor: theme.colors.divider }}>
                  <View className="flex-1">
                    <Text className="text-sm" style={{ color: theme.colors.faint }}>Water Intake</Text>
                    <Text className="text-base font-bold" style={{ color: theme.colors.ink }}>
                      {formatter(lifestyleProfile?.water_intake || "") || "—"}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center py-3">
                  <View className="flex-1">
                    <Text className="text-sm" style={{ color: theme.colors.faint }}>Stress Level</Text>
                    <Text className="text-base font-bold" style={{ color: theme.colors.ink }}>
                      {formatter(lifestyleProfile?.stress_level || "") || "—"}
                    </Text>
                  </View>
                </View>
              </ClinicalCard>
            )}
          </FadeItem>

          {/* Dermatologist review of the profile data */}
          {validation !== undefined ? (
            <FadeItem index={3}>
              <ProfileReviewCard
                validation={validation}
                onBook={() => router.push("/(tabs)/derma")}
              />
            </FadeItem>
          ) : null}

          {/* Notifications */}
          <FadeItem index={4}>
            <ClinicalCard className="flex-col gap-3 mt-4">
              <SectionTitle title="Notifications" />
              <View className="flex-row items-center justify-between py-3 border-b" style={{ borderBottomColor: theme.colors.divider }}>
                <View className="flex-col flex-1 pr-3">
  <Text className="text-base font-semibold" style={{ color: theme.colors.ink }}>
                      Scan Reminders
                    </Text>
                    <Text className="text-sm" style={{ color: theme.colors.faint }}>
                    Weekly skin check reminders
                  </Text>
                </View>
                <Switch
                  value={settings.scanReminders}
                  onValueChange={(val) => updateSettings({ scanReminders: val })}
  trackColor={{ false: theme.colors.cardBorder, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View className="flex-row items-center justify-between py-3">
                <View className="flex-col flex-1 pr-3">
                  <Text className="text-base font-semibold" style={{ color: theme.colors.ink }}>
                    Daily Skincare Tips
                  </Text>
                  <Text className="text-sm" style={{ color: theme.colors.faint }}>
                    Personalized tips & advice
                  </Text>
                </View>
                <Switch
                  value={settings.dailyTips}
                  onValueChange={(val) => updateSettings({ dailyTips: val })}
                  trackColor={{ false: theme.colors.cardBorder, true: theme.colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </ClinicalCard>
          </FadeItem>

          {/* App: replay the first-run tour */}
          <FadeItem index={5}>
            <ClinicalCard className="mt-4">
              <SectionTitle title="App" />
              <Pressable
                onPress={() => {
                  // The tour navigates itself: every step carries its own
                  // screen's href, so it walks back to Home on its own.
                  startTutorial();
                }}
                accessibilityRole="button"
                accessibilityLabel="Replay tutorial"
                className="flex-row items-center gap-3 pt-3"
              >
                <View className="flex-1">
                  <Text className="text-base font-semibold" style={{ color: theme.colors.ink }}>
                    Replay Tutorial
                  </Text>
                  <Text className="text-sm" style={{ color: theme.colors.faint }}>
                    Watch the app tour again
                  </Text>
                </View>
                <ChevronRight size={18} color={theme.colors.faint} />
              </Pressable>
            </ClinicalCard>
          </FadeItem>

          <FadeItem index={6}>
            <Pressable
              className="active:opacity-80 py-4 mt-5 rounded-full flex-row items-center justify-center gap-2"
              style={{ backgroundColor: theme.colors.danger }}
              accessibilityRole="button"
              accessibilityLabel="Logout"
              onPress={() => setLogoutModal(true)}
            >
              <LogOut size={18} color={theme.colors.card} />
              <Text className="font-bold" style={{ color: theme.colors.card }}>Logout</Text>
            </Pressable>
            <Pressable
              className="active:opacity-60 py-3 mt-2 items-center"
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              onPress={() => setDeleteModal(true)}
            >
              <Text className="text-sm font-semibold" style={{ color: theme.colors.danger }}>
                Delete account
              </Text>
            </Pressable>
          </FadeItem>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function ProfileReviewCard({
  validation,
  onBook,
}: {
  validation: ProfileValidation | null;
  onBook: () => void;
}) {
  const reviewed = validation !== null;
  const current = validation?.is_current ?? false;
  const confirmed = reviewed && current && validation.status === "confirmed";
  const flagged = reviewed && current && validation.status === "needs_review";

  const Icon = confirmed ? ShieldCheck : flagged ? TriangleAlert : UserRoundSearch;
  const iconColor = confirmed
    ? theme.colors.primary
    : flagged || (reviewed && !current)
      ? theme.colors.star
      : theme.colors.faint;
  const title = !reviewed
    ? "Not yet reviewed"
    : !current
      ? "Updated since last review"
      : confirmed
        ? "Verified by your dermatologist"
        : "Your dermatologist left a follow-up";
  const body = !reviewed
    ? "Book a consultation and your dermatologist can verify your skin type, lifestyle and sensitivity history."
    : !current
      ? "You changed your profile after it was reviewed. It will be checked again at your next consultation."
      : confirmed
        ? "Your profile details were checked and confirmed."
        : "Some of your profile details may need correcting — see the note below.";
  const when = validation?.validated_at
    ? new Date(validation.validated_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <ClinicalCard className="flex-col gap-3 mt-4">
      <SectionTitle title="Dermatologist Review" />
      <View className="flex-row items-start gap-3">
        <View
          className="h-9 w-9 rounded-full items-center justify-center"
          style={{ backgroundColor: confirmed ? theme.colors.primarySoft : theme.colors.background }}
        >
          <Icon size={18} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold" style={{ color: theme.colors.ink }}>
            {title}
          </Text>
          <Text className="text-sm mt-0.5" style={{ color: theme.colors.faint }}>
            {body}
          </Text>
          {reviewed ? (
            <Text className="text-xs mt-1.5" style={{ color: theme.colors.muted }}>
              {validation.validator_name ? `${validation.validator_name} · ` : ""}
              {when}
            </Text>
          ) : null}
        </View>
      </View>
      {validation?.doctor_notes ? (
        <View
          className="rounded-xl px-3 py-2.5"
          style={{
            backgroundColor: flagged ? theme.colors.warningBg : theme.colors.background,
            borderWidth: 1,
            borderColor: flagged ? theme.colors.warningBorder : theme.colors.cardBorder,
          }}
        >
          <Text
            className="text-sm"
            style={{ color: flagged ? theme.colors.warningText : theme.colors.body }}
          >
            {validation.doctor_notes}
          </Text>
        </View>
      ) : null}
      {!reviewed ? (
        <Pressable
          onPress={onBook}
          accessibilityRole="button"
          accessibilityLabel="Find a dermatologist"
          className="flex-row items-center gap-1 self-start active:opacity-70"
        >
          <Text className="text-sm font-bold" style={{ color: theme.colors.primary }}>
            Find a dermatologist
          </Text>
          <ChevronRight size={16} color={theme.colors.primary} />
        </Pressable>
      ) : null}
    </ClinicalCard>
  );
}
