import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, TextInput, View } from "react-native";
import { Eye, EyeOff, Lock } from "lucide-react-native";

import { Text } from "@/components/Text";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { KeyboardAwareScroll } from "@/components/KeyboardAwareView";
import { PrimaryButton } from "@/components/ui";
import { useNetwork } from "@/hooks/useNetwork";
import { theme } from "@/lib/theme";
import {
  getReauthMethods,
  reauthenticateWithGoogle,
  reauthenticateWithPassword,
  type ReauthMethod,
} from "@/lib/db/auth";

type ReauthGateProps = {
  title: string;
  message: string;
  onVerified: () => void;
  onCancel: () => void;
};

/** Full-screen "confirm it's you" step shown before a sensitive account change. */
export function ReauthGate({ title, message, onVerified, onCancel }: ReauthGateProps) {
  const { isConnected } = useNetwork();
  const [methods, setMethods] = useState<ReauthMethod[] | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Which method is in flight, so only that button shows a spinner.
  const [busy, setBusy] = useState<ReauthMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReauthMethods()
      .then((m) => !cancelled && setMethods(m))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const hasPassword = !!methods?.includes("password");
  const hasGoogle = !!methods?.includes("google");

  const verify = async (method: ReauthMethod) => {
    if (busy) return;
    if (!isConnected) {
      setError("Connect to the internet to verify it's you.");
      return;
    }
    setBusy(method);
    setError(null);
    try {
      if (method === "password") await reauthenticateWithPassword(password);
      else await reauthenticateWithGoogle();
      setPassword("");
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't verify. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <KeyboardAwareScroll contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 32 }}>
        <Text className="font-bold text-[22px]" style={{ color: theme.colors.ink }}>
          {title}
        </Text>
        <Text className="text-sm leading-5 mt-2" style={{ color: theme.colors.muted }}>
          {message}
        </Text>

        <View className="mt-6 gap-2">
          {methods === null && !error ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : hasPassword ? (
            <>
              <Text className="text-sm font-medium" style={{ color: theme.colors.ink }}>
                Password
              </Text>
              <View
                className="flex-row items-center bg-white px-4 py-3 gap-2"
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.cardBorder,
                  borderRadius: theme.radius.input,
                }}
              >
                <Lock size={22} color={theme.colors.muted} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  className="flex-1"
                  style={{ color: theme.colors.ink }}
                  placeholderTextColor={theme.colors.faint}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  // With Google also offered, an auto-opened keyboard would hide that button.
                  autoFocus={!hasGoogle}
                  onSubmitEditing={() => void verify("password")}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  className="active:opacity-60"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff size={22} color={theme.colors.muted} />
                  ) : (
                    <Eye size={22} color={theme.colors.muted} />
                  )}
                </Pressable>
              </View>
            </>
          ) : hasGoogle ? (
            <Text className="text-sm leading-5" style={{ color: theme.colors.body }}>
              Sign in again with the Google account you use for SkinLens.
            </Text>
          ) : null}

          {error ? (
            <Text className="text-sm mt-1" style={{ color: theme.colors.danger }}>
              {error}
            </Text>
          ) : null}
        </View>

        <View className="flex-1" />

        <View className="gap-3 mt-6">
          {hasPassword || methods === null ? (
            <PrimaryButton
              label="Verify"
              onPress={() => void verify("password")}
              loading={busy === "password"}
              disabled={methods === null || busy !== null}
            />
          ) : null}
          {hasPassword && hasGoogle ? (
            <View className="flex-row items-center gap-3">
              <View className="flex-1 h-px" style={{ backgroundColor: theme.colors.cardBorder }} />
              <Text className="text-xs" style={{ color: theme.colors.faint }}>
                or
              </Text>
              <View className="flex-1 h-px" style={{ backgroundColor: theme.colors.cardBorder }} />
            </View>
          ) : null}
          {hasGoogle ? (
            <Pressable
              className="bg-white p-4 rounded-full active:opacity-80"
              style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
              onPress={() => void verify("google")}
              disabled={busy !== null}
            >
              <View className="flex-row justify-center items-center gap-2">
                {busy === "google" ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : (
                  <Image
                    source={require("@/assets/images/google.png")}
                    style={{ width: 20, height: 20 }}
                  />
                )}
                <Text className="font-bold" style={{ color: theme.colors.body }}>
                  Continue with Google
                </Text>
              </View>
            </Pressable>
          ) : null}
          <Pressable onPress={onCancel} className="active:opacity-70 items-center py-2">
            <Text className="text-sm font-semibold" style={{ color: theme.colors.faint }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
