import { useCallback, useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { useFocusEffect, useRouter } from "expo-router";
import { Camera, Map, Marker } from "@maplibre/maplibre-react-native";
import {
  ChevronRight,
  Cross,
  ExternalLink,
  Pencil,
  LogOut,
  MapPin,
  ShieldCheck,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import { FadeItem } from "@/components/FadeItem";
import { CoachTarget, useTutorial } from "@/components/TutorialCoach";
import { useCoachScroller } from "@/hooks/useCoachScroller";
import { InfoCard } from "@/components/Info";
import LogoutModal from "@/components/LogoutModal";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import {
  CardTitleSkeleton,
  HeroTextSkeleton,
  IconRowsSkeleton,
} from "@/components/ProfileSkeletons";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  ClinicalCard,
  Pill,
  PrimaryButton,
  ScreenHeader,
  SectionTitle,
  UiModal,
} from "@/components/ui";
import { theme, cardShadow } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import {
  getClinicAppointments,
  getMyDoctorProfile,
  isPendingStatus,
  redeemInviteCode,
  type DoctorProfile,
} from "@/lib/db/appointments";
import { useNotifications } from "@/hooks/useNotifications";
import { requestNotificationPermissions } from "@/lib/push-notifications";
import { supabase } from "@/utils/supabase";

const MAP_STYLE_URL = `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${
  process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? ""
}`;

function initialOf(name: string): string {
  return (name.trim().charAt(0) || "D").toUpperCase();
}

export default function DoctorProfileScreen() {
  const router = useRouter();
  const { startTutorial } = useTutorial();
  // Tab screens keep their scroll offset between visits, so the tutorial
  // needs to scroll its target back into view.
  const scrollRef = useRef<ScrollView>(null);
  const { onScroll, scrollIntoView } = useCoachScroller(scrollRef);
  const { settings, updateSettings, refresh: refreshNotifications } = useNotifications();
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [email, setEmail] = useState<string>("");
  const [waiting, setWaiting] = useState(0);
  const [scheduled, setScheduled] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkCode, setLinkCode] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ data: userData }] = await Promise.all([supabase.auth.getUser()]);
      setEmail(userData.user?.email ?? "");
      const prof = await getMyDoctorProfile();
      setDoctor(prof);
      if (prof) {
        const appts = await getClinicAppointments(prof.clinicId);
        setWaiting(appts.filter((a) => isPendingStatus(a.status)).length);
        setScheduled(appts.filter((a) => a.status === "scheduled").length);
      }
    } catch (err) {
      console.error("[doctor/profile] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleLink = useCallback(async () => {
    setLinkError(null);
    const code = linkCode.trim().toUpperCase();
    // The "Switch hospital" modal has no name field, so keep the doctor's
    // existing name. The initial-link card still lets a new doctor type one.
    const name = (doctor?.displayName || linkName.trim() || "").trim();
    if (!code || !name) {
      setLinkError("Enter your display name and the invite code.");
      return;
    }
    setLinkLoading(true);
    try {
      await redeemInviteCode(code, name);
      setLinkOpen(false);
      setLinkCode("");
      setLoading(true);
      await load();
      ToastAndroid.show("Hospital linked successfully", ToastAndroid.SHORT);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Invalid invite code.");
    } finally {
      setLinkLoading(false);
    }
  }, [linkCode, linkName, doctor, load]);

  const toggleRequestNotifications = useCallback(
    async (enabled: boolean) => {
      await updateSettings({ appointmentRequests: enabled });
      if (!enabled) return;
      // Phone banners need OS permission; in-app notifications work regardless.
      const granted = await requestNotificationPermissions().catch(() => false);
      if (!granted) {
        ToastAndroid.show(
          "Allow notifications in system settings to get phone alerts.",
          ToastAndroid.LONG,
        );
      }
      void refreshNotifications();
    },
    [updateSettings, refreshNotifications],
  );

  const hasCoords = doctor?.clinicLatitude != null && doctor?.clinicLongitude != null;

  const openClinicMap = useCallback(() => {
    if (!doctor || doctor.clinicLatitude == null || doctor.clinicLongitude == null) return;
    const lat = doctor.clinicLatitude;
    const lng = doctor.clinicLongitude;
    const label = encodeURIComponent(doctor.clinicName);
    const url =
      Platform.OS === "android"
        ? `geo:${lat},${lng}?q=${lat},${lng}(${label})`
        : `https://maps.apple.com/?ll=${lat},${lng}&q=${label}`;
    Linking.openURL(url).catch(() => {
      ToastAndroid.show("Couldn't open the map app on this device.", ToastAndroid.SHORT);
    });
  }, [doctor]);

  return (
    <>
      <LogoutModal isVisible={logoutModal} setVisible={setLogoutModal} />
      <DeleteAccountModal isVisible={deleteModal} setVisible={setDeleteModal} />
      <UiModal
        visible={linkOpen}
        onDismiss={() => {
          setLinkOpen(false);
          setLinkError(null);
        }}
        title="Link a different hospital"
        message="Each doctor account belongs to one hospital. Enter a new invite code to move it."
        actions={[
          { label: "Link Hospital", loading: linkLoading, onPress: () => void handleLink() },
          {
            label: "Cancel",
            kind: "ghost",
            onPress: () => {
              setLinkOpen(false);
              setLinkError(null);
            },
          },
        ]}
      >
        {linkError ? (
          <Text className="text-xs mb-2" style={{ color: theme.colors.danger }}>
            {linkError}
          </Text>
        ) : null}
        <TextInput
          value={linkCode}
          onChangeText={(t) => setLinkCode(t.toUpperCase())}
          placeholder="SKN-XXXXXX"
          placeholderTextColor={theme.colors.faint}
          autoCapitalize="characters"
          className="bg-white rounded-2xl px-4 py-3"
          style={{ color: theme.colors.ink, borderWidth: 1, borderColor: theme.colors.cardBorder }}
        />
      </UiModal>

      <SafeAreaView
        edges={["top"]}
        className="flex-1"
        style={{ backgroundColor: theme.colors.background }}
      >
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
          {/* Header + identity hero (mirrors the patient "My Profile" tab) */}
          <FadeItem index={0}>
            <CoachTarget id="doctor.profile.card" scrollIntoView={scrollIntoView}>
              {loading ? (
                <HeroTextSkeleton />
              ) : (
                <View className="mt-2">
                  <View className="flex-row items-start justify-between">
                    <ScreenHeader title="My Profile" subtitle="Your doctor profile" />
                    {doctor ? (
                      <Pressable
                        onPress={() => router.push("/(modules)/doctor-edit-profile")}
                        accessibilityRole="button"
                        accessibilityLabel="Edit profile"
                        className="flex-row items-center gap-1.5 bg-white rounded-full px-3.5 py-2 active:opacity-70"
                        style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
                      >
                        <Pencil size={14} color={theme.colors.primary} />
                        <Text className="text-sm font-bold" style={{ color: theme.colors.primary }}>
                          Edit
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <LinearGradient
                    colors={[...theme.gradients.dark]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    className="flex-col mt-4 px-4 py-4"
                    style={{ borderRadius: theme.radius.card, ...cardShadow }}
                  >
                    <View className="flex-row items-center gap-4">
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
                          {initialOf(doctor?.displayName ?? email)}
                        </Text>
                      </LinearGradient>
                      <View className="flex-1">
                        <Text
                          className="font-semibold mt-0.5 text-xl"
                          style={{ color: "#FFFFFF" }}
                          numberOfLines={1}
                        >
                          {doctor?.displayName ?? "Doctor"}
                        </Text>
                        {email ? (
                          <Text
                            className="text-sm mt-0.5"
                            style={{ color: "rgba(255,255,255,0.8)" }}
                            numberOfLines={1}
                          >
                            {email}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View className="mt-2 self-start">
                      <Pill label={doctor?.specialty ?? "Dermatology"} />
                    </View>
                    {doctor ? (
                      <View className="flex-row gap-3 mt-3">
                        <InfoCard label="Waiting" value={String(waiting)} />
                        <InfoCard label="Scheduled" value={String(scheduled)} />
                      </View>
                    ) : null}
                  </LinearGradient>
                </View>
              )}
            </CoachTarget>
          </FadeItem>

          {/* Clinic */}
          <FadeItem index={1}>
            {loading ? (
              <ClinicalCard className="flex-col gap-3 mt-5">
                <CardTitleSkeleton />
                <IconRowsSkeleton rows={2} />
                <Skeleton className="h-12 w-full rounded-full" />
              </ClinicalCard>
            ) : !doctor ? (
              <ClinicalCard className="flex-col gap-3 mt-5">
                <View className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text className="font-bold text-[15px]" style={{ color: theme.colors.ink }}>
                      Link your hospital
                    </Text>
                    <Text className="text-xs mt-0.5" style={{ color: theme.colors.muted }}>
                      Enter the invite code from your hospital admin.
                    </Text>
                  </View>
                </View>
                <TextInput
                  value={linkName}
                  onChangeText={setLinkName}
                  placeholder="Display name (Dr. Jane Cruz)"
                  placeholderTextColor={theme.colors.faint}
                  className="bg-white rounded-2xl px-4 py-3"
                  style={{
                    color: theme.colors.ink,
                    borderWidth: 1,
                    borderColor: theme.colors.cardBorder,
                  }}
                />
                <TextInput
                  value={linkCode}
                  onChangeText={(t) => setLinkCode(t.toUpperCase())}
                  placeholder="SKN-XXXXXX"
                  placeholderTextColor={theme.colors.faint}
                  autoCapitalize="characters"
                  className="bg-white rounded-2xl px-4 py-3"
                  style={{
                    color: theme.colors.ink,
                    borderWidth: 1,
                    borderColor: theme.colors.cardBorder,
                  }}
                />
                {linkError ? (
                  <Text className="text-xs" style={{ color: theme.colors.danger }}>
                    {linkError}
                  </Text>
                ) : null}
                <PrimaryButton
                  label="Link Hospital"
                  onPress={() => void handleLink()}
                  loading={linkLoading}
                />
              </ClinicalCard>
            ) : (
              <ClinicalCard className="flex-col gap-3 mt-5">
                <SectionTitle title="Hospital" meta="Verified clinic" />
                <View className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text
                      className="text-base font-bold"
                      style={{ color: theme.colors.ink }}
                      numberOfLines={1}
                    >
                      {doctor?.clinicName ?? "Not linked yet"}
                    </Text>
                    <Text
                      className="text-sm"
                      style={{ color: theme.colors.muted }}
                      numberOfLines={1}
                    >
                      {doctor ? "Invite-code verified" : "Link your hospital to receive requests"}
                    </Text>
                  </View>
                  <ShieldCheck size={18} color={theme.colors.primary} />
                </View>
                <Pressable
                  className="flex-row items-center gap-3 rounded-2xl px-3 py-3 active:opacity-70"
                  style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
                  disabled={!hasCoords}
                  onPress={openClinicMap}
                  accessibilityRole={hasCoords ? "button" : undefined}
                  accessibilityLabel={`Hospital location: ${doctor.clinicAddress || "Address not set"}`}
                >
                  <MapPin size={18} color={theme.colors.primary} />
                  <View className="flex-1">
                    <Text className="text-xs" style={{ color: theme.colors.muted }}>
                      Location
                    </Text>
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: theme.colors.ink }}
                      numberOfLines={2}
                    >
                      {doctor.clinicAddress || "Address not set"}
                    </Text>
                  </View>
                  {hasCoords ? <ExternalLink size={16} color={theme.colors.muted} /> : null}
                </Pressable>
                {hasCoords ? (
                  <View
                    className="overflow-hidden h-44"
                    style={{
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: theme.colors.cardBorder,
                      backgroundColor: theme.colors.primarySoft,
                    }}
                  >
                    {/* Static preview: gestures off so it doesn't fight the
                      ScrollView; tapping opens the full maps app. */}
                    <Map
                      mapStyle={MAP_STYLE_URL}
                      logo={false}
                      compass={false}
                      dragPan={false}
                      touchZoom={false}
                      doubleTapZoom={false}
                      touchRotate={false}
                      touchPitch={false}
                      onPress={openClinicMap}
                    >
                      <Camera
                        initialViewState={{
                          center: [doctor.clinicLongitude!, doctor.clinicLatitude!],
                          zoom: 15,
                        }}
                      />
                      <Marker
                        id="clinic-location"
                        lngLat={[doctor.clinicLongitude!, doctor.clinicLatitude!]}
                      >
                        <View
                          className="h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow-sm"
                          style={{ backgroundColor: theme.colors.primary }}
                        >
                          <Cross size={13} color="white" />
                        </View>
                      </Marker>
                    </Map>
                  </View>
                ) : null}
                <View className="flex-row items-center gap-2 pt-1">
                  <View className="flex-1">
                    <PrimaryButton label="Switch hospital" onPress={() => setLinkOpen(true)} />
                  </View>
                </View>
              </ClinicalCard>
            )}
          </FadeItem>

          {/* Notifications */}
          {doctor ? (
            <FadeItem index={2}>
              <ClinicalCard className="flex-col gap-3 mt-4">
                <SectionTitle title="Notifications" />
                <View className="flex-row items-center justify-between py-3">
                  <View className="flex-col flex-1 pr-3">
                    <Text className="text-base font-semibold" style={{ color: theme.colors.ink }}>
                      Appointment Requests
                    </Text>
                    <Text className="text-sm" style={{ color: theme.colors.faint }}>
                      Alerts when a patient books a visit
                    </Text>
                  </View>
                  <Switch
                    value={settings.appointmentRequests}
                    onValueChange={(val) => void toggleRequestNotifications(val)}
                    trackColor={{ false: theme.colors.cardBorder, true: theme.colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </ClinicalCard>
            </FadeItem>
          ) : null}

          {/* App: replay the doctor tour */}
          <FadeItem index={3}>
            <ClinicalCard className="mt-4">
              <SectionTitle title="App" />
              <Pressable
                // The tour navigates itself: every step carries its own
                // screen's href, so it walks back to Home on its own.
                onPress={() => startTutorial("doctor")}
                accessibilityRole="button"
                accessibilityLabel="Replay tutorial"
                className="flex-row items-center gap-3 pt-3 active:opacity-70"
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

          {/* Session */}
          <FadeItem index={4}>
            <Pressable
              className="active:opacity-80 py-4 mt-5 rounded-full flex-row items-center justify-center gap-2"
              style={{ backgroundColor: theme.colors.danger }}
              accessibilityRole="button"
              accessibilityLabel="Logout"
              onPress={() => setLogoutModal(true)}
            >
              <LogOut size={18} color={theme.colors.card} />
              <Text className="font-bold" style={{ color: theme.colors.card }}>
                Logout
              </Text>
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
