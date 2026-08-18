import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeRedirectUri } from "expo-auth-session";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
  offlineAccess: true,
});

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices();
  const userInfo = await GoogleSignin.signIn();
  const idToken = userInfo.data?.idToken;
  if (!idToken) {
    throw new Error("No ID token returned from Google Sign-In");
  }
  const { data: authData, error: authError } =
    await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });
  if (authError) throw authError;
  const user = authData.user;
  if (!user) {
    throw new Error("Sign-in succeeded but no user was returned.");
  }
  const googleUser = userInfo.data?.user;
  const email = user.email ?? googleUser?.email ?? "";
  const fullName = googleUser?.name ?? "";
  const { error: insertError } = await supabase.from("user_profile").upsert(
    {
      id: user.id,
      username: fullName || email.split("@")[0],
      email,
    },
    { onConflict: "id", ignoreDuplicates: false },
  );
  if (insertError) {
    throw insertError;
  }
  return user;
}

const redirectTo = makeRedirectUri({ path: "create-new-password" });

export async function sendResetEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}
