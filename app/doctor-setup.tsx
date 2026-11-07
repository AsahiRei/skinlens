import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, TextInput, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { Stethoscope, Ticket, User } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { PrimaryButton, ScreenHeader } from "@/components/ui";
import { theme } from "@/lib/theme";
import {
  clearPendingDoctorSignup,
  getMyDoctorProfile,
  readPendingDoctorSignup,
  redeemInviteCode,
} from "@/lib/db/appointments";
import { friendlyError, isDuplicateKeyError } from "@/lib/db/pg-errors";
import { supabase, signOutLocal } from "@/utils/supabase";

/**
 * Finish a doctor sign-up whose invite code wasn't redeemed yet — either
 * email confirmation was pending at sign-up, or the code failed (used up /
 * expired between the pre-check and the redeem). app/index.tsx routes here
 * while auth user_metadata.pending_invite_code is set.
 */
export default function DoctorSetup() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        if (!data.user) {
          router.replace("/welcome");
          return;
        }
        // Already linked (e.g. the marker clear failed after a redeem):
        // tidy up and go straight to the dashboard.
        const prof = await getMyDoctorProfile().catch(() => null);
        if (!alive) return;
        if (prof) {
          await clearPendingDoctorSignup().catch(() => {});
          router.replace("/doctor");
          return;
        }
        const pending = readPendingDoctorSignup(data.user.user_metadata);
        if (pending) {
          setName(pending.displayName);
          setCode(pending.inviteCode);
        }
      } catch (err) {
        console.warn("[doctor-setup] load failed:", err);
        if (alive) setError(friendlyError(err));
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  const handleLink = useCallback(async () => {
    setError(null);
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanName || !cleanCode) {
      setError("Enter your full name and the hospital invite code.");
      return;
    }
    setLinking(true);
    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        router.replace("/welcome");
        return;
      }
      // Accounts that waited on email confirmation never got a profile row,
      // and redeem_clinic_code() stamps role='doctor' onto that row.
      const { error: insertError } = await supabase.from("user_profile").insert({
        id: user.id,
        username: cleanName,
        first_name: cleanName,
        email: user.email ?? "",
      });
      if (insertError && !isDuplicateKeyError(insertError)) {
        throw insertError;
      }
      const res = await redeemInviteCode(cleanCode, cleanName);
      await clearPendingDoctorSignup().catch((e) =>
        console.warn("[doctor-setup] clear pending marker failed:", e),
      );
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} doctor-setup linked clinic=`, res.clinic_name);
      router.replace("/doctor");
    } catch (err) {
      console.log(`[SkinLens][Auth] ${new Date().toISOString()} doctor-setup redeem failed:`, err);
      setError(friendlyError(err, "Couldn't link your hospital. Please try again."));
    } finally {
      setLinking(false);
    }
  }, [name, code, router]);

  const continueAsPatient = useCallback(async () => {
    setError(null);
    setLeaving(true);
    try {
      await clearPendingDoctorSignup();
      router.replace("/");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLeaving(false);
    }
  }, [router]);

  const signOut = useCallback(async () => {
    await signOutLocal();
    router.replace("/welcome");
  }, [router]);

  if (checking) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <KeyboardAwareScroll contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 40 }}>
        <View className="flex-col gap-4">
          <View className="items-center mt-6 mb-2">
            <View
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: theme.colors.primary }}
            >
              <Stethoscope size={30} color="white" />
            </View>
          </View>
          <ScreenHeader
            title="Finish doctor setup"
            subtitle="Link your account to your hospital with the invite code your hospital gave you."
          />

          <View className="flex-col gap-2">
            <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>Full Name</Text>
            <View className="flex-row items-center bg-white px-4 py-3 gap-2" style={{ borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: theme.radius.input }}>
              <User size={22} color={theme.colors.muted} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Dr. Jane Cruz"
                className="flex-1"
                style={{ color: theme.colors.ink }}
                placeholderTextColor={theme.colors.faint}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View className="flex-col gap-2">
            <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>Hospital Invite Code</Text>
            <View className="flex-row items-center bg-white px-4 py-3 gap-2" style={{ borderWidth: 1, borderColor: error ? theme.colors.danger : theme.colors.cardBorder, borderRadius: theme.radius.input }}>
              <Ticket size={22} color={theme.colors.muted} />
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="SKN-XXXXXX"
                className="flex-1"
                style={{ color: theme.colors.ink }}
                placeholderTextColor={theme.colors.faint}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
              />
            </View>
            {error ? (
              <Text className="text-xs" style={{ color: theme.colors.danger }} accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : (
              <Text className="text-xs" style={{ color: theme.colors.muted }}>
                Codes can expire or run out. Ask your hospital for a new one if this one doesn&apos;t work.
              </Text>
            )}
          </View>

          <PrimaryButton label="Link Hospital" onPress={() => void handleLink()} loading={linking} />

          <Pressable
            onPress={() => void continueAsPatient()}
            disabled={leaving || linking}
            accessibilityRole="button"
            className="items-center py-2 active:opacity-60"
          >
            <Text className="text-sm font-medium" style={{ color: theme.colors.primary }}>
              {leaving ? "Switching…" : "I'm not a doctor — continue as a patient"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void signOut()}
            accessibilityRole="button"
            className="items-center py-1 active:opacity-60"
          >
            <Text className="text-sm" style={{ color: theme.colors.muted }}>Sign out</Text>
          </Pressable>
        </View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
