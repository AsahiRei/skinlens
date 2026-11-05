import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { useFocusEffect } from "expo-router";
import {
  Building2,
  LogOut,
  Mail,
  RefreshCcw,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import { FadeItem } from "@/components/FadeItem";
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
  IconBadge,
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
  redeemInviteCode,
  type DoctorProfile,
} from "@/lib/db/appointments";
import { supabase } from "@/utils/supabase";

function initialOf(name: string): string {
  return (name.trim().charAt(0) || "D").toUpperCase();
}

export default function DoctorProfileScreen() {
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
      const [{ data: userData }] = await Promise.all([
        supabase.auth.getUser(),
      ]);
      setEmail(userData.user?.email ?? "");
      const prof = await getMyDoctorProfile();
      setDoctor(prof);
      if (prof) {
        const appts = await getClinicAppointments(prof.clinicId);
        setWaiting(appts.filter((a) => a.status === "requested").length);
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
        icon={Ticket}
        tone="soft"
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

      <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        >
          <FadeItem index={0}>
            <View className="mt-2">
              <ScreenHeader title="Account" subtitle="Your doctor profile" />
            </View>
          </FadeItem>

          {/* Identity hero */}
          <FadeItem index={1}>
            {loading ? (
              <HeroTextSkeleton className="mt-4" />
            ) : (
              <LinearGradient
                colors={[...theme.gradients.dark]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                className="mt-4 px-4 py-5"
                style={{ borderRadius: theme.radius.card, ...cardShadow }}
              >
                <View className="flex-row items-center gap-4">
                  <LinearGradient
                    colors={[...theme.gradients.icon]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      height: 68,
                      width: 68,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text className="text-2xl font-bold text-white">
                      {initialOf(doctor?.displayName ?? email)}
                    </Text>
                  </LinearGradient>
                  <View className="flex-1">
                    <Text className="font-bold text-xl" style={{ color: "#FFFFFF" }} numberOfLines={1}>
                      {doctor?.displayName ?? "Doctor"}
                    </Text>
                    <Text className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.8)" }} numberOfLines={1}>
                      {doctor?.specialty ?? "Dermatology"}
                    </Text>
                    {email ? (
                      <View className="flex-row items-center gap-1.5 mt-1.5">
                        <Mail size={12} color="rgba(255,255,255,0.7)" />
                        <Text className="text-xs flex-1" style={{ color: "rgba(255,255,255,0.7)" }} numberOfLines={1}>
                          {email}
                        </Text>
                      </View>
                    ) : null}
                    <View className="flex-row items-center gap-1.5 mt-1.5">
                      <Users size={12} color="rgba(255,255,255,0.6)" />
                      <Text className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
                        {waiting} waiting · {scheduled} scheduled
                      </Text>
                    </View>
                  </View>
                </View>
                
              </LinearGradient>
            )}
          </FadeItem>

          {/* Clinic */}
          <FadeItem index={2}>
            {loading ? (
              <ClinicalCard className="flex-col gap-3 mt-5">
                <CardTitleSkeleton />
                <IconRowsSkeleton rows={1} />
                <Skeleton className="h-12 w-full rounded-full" />
              </ClinicalCard>
            ) : !doctor ? (
              <ClinicalCard className="flex-col gap-3 mt-5">
                <View className="flex-row items-center gap-3">
                  <IconBadge icon={Ticket} size="lg" tone="soft" />
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
                  style={{ color: theme.colors.ink, borderWidth: 1, borderColor: theme.colors.cardBorder }}
                />
                <TextInput
                  value={linkCode}
                  onChangeText={(t) => setLinkCode(t.toUpperCase())}
                  placeholder="SKN-XXXXXX"
                  placeholderTextColor={theme.colors.faint}
                  autoCapitalize="characters"
                  className="bg-white rounded-2xl px-4 py-3"
                  style={{ color: theme.colors.ink, borderWidth: 1, borderColor: theme.colors.cardBorder }}
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
                <IconBadge icon={Building2} size="md" tone="soft" />
                <View className="flex-1">
                  <Text className="text-base font-bold" style={{ color: theme.colors.ink }} numberOfLines={1}>
                    {doctor?.clinicName ?? "Not linked yet"}
                  </Text>
                  <Text className="text-sm" style={{ color: theme.colors.muted }} numberOfLines={1}>
                    {doctor ? "Invite-code verified" : "Link your hospital to receive requests"}
                  </Text>
                </View>
                <ShieldCheck size={18} color={theme.colors.primary} />
              </View>
              <View className="flex-row items-center gap-2 pt-1">
                <View className="flex-1">
                  <PrimaryButton label="Switch hospital" onPress={() => setLinkOpen(true)} icon={RefreshCcw} />
                </View>
              </View>
            </ClinicalCard>
            )}
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
              <LogOut size={18} color="#FFFFFF" />
              <Text className="font-bold text-white">Logout</Text>
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
