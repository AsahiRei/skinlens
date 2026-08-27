import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";
import { createClient } from "@supabase/supabase-js";

<<<<<<< HEAD
const REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

=======
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
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
<<<<<<< HEAD
    global: {
      fetch: fetchWithTimeout,
    },
=======
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
  },
);

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri({ path: "auth-callback" });

export const createSessionFromUrl = async (url: string) => {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);
  const { access_token, refresh_token } = params;
  if (!access_token) return null;
  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (error) throw error;
  return data.session;
};

async function upsertProfile(
  user: { id: string; email?: string | null },
  fullName?: string,
) {
  const email = user.email ?? "";
  const { error: insertError } = await supabase.from("user_profile").upsert(
    {
      id: user.id,
      username: fullName || email.split("@")[0],
      email,
    },
    { onConflict: "id", ignoreDuplicates: false },
  );
  if (insertError) throw insertError;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) {
    throw new Error("No auth URL returned from Supabase.");
  }
  const authStatePromise = new Promise<void>((resolve) => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        sub.subscription.unsubscribe();
        resolve();
      }
    });
    setTimeout(() => {
      sub.subscription.unsubscribe();
      resolve();
    }, 15000);
  });

  const browserResultPromise = WebBrowser.openAuthSessionAsync(
    data.url,
    redirectTo,
  ).then(async (result) => {
    if (result.type === "success" && result.url) {
      await createSessionFromUrl(result.url);
    }
  });
  await Promise.race([authStatePromise, browserResultPromise]);
  await Promise.allSettled([authStatePromise, browserResultPromise]);
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    throw new Error("Google sign-in was cancelled or failed.");
  }
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "";
  await upsertProfile(user, fullName);
  return user;
}

export async function sendResetEmail(email: string) {
  const resetRedirect = makeRedirectUri({ path: "create-new-password" });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetRedirect,
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}
