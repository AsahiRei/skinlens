import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";
import { createClient, type Session } from "@supabase/supabase-js";

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

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY. " +
      "Check your .env (see .env.example) and rebuild the dev client.",
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  });

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri({ path: "auth-callback" });

export const createSessionFromUrl = async (url: string) => {
  console.log(`[SkinLens][Supabase] ${new Date().toISOString()} createSessionFromUrl start url=`, url?.slice(0, 120));
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) {
    console.log(`[SkinLens][Supabase] ${new Date().toISOString()} createSessionFromUrl errorCode=`, errorCode);
    throw new Error(errorCode);
  }
  const { access_token, refresh_token } = params;
  if (!access_token) {
    console.log(`[SkinLens][Supabase] ${new Date().toISOString()} createSessionFromUrl no access_token, skipping`);
    return null;
  }
  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (error) {
    console.log(`[SkinLens][Supabase] ${new Date().toISOString()} setSession failed:`, error.message);
    throw error;
  }
  console.log(`[SkinLens][Supabase] ${new Date().toISOString()} setSession success user=`, data.session?.user?.id);
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
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} signInWithGoogle start`);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) {
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} signInWithOAuth failed:`, error.message);
    throw error;
  }
  if (!data?.url) {
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} signInWithGoogle no auth URL returned`);
    throw new Error("No auth URL returned from Supabase.");
  }
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} OAuth URL received, opening browser`);
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
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} browser result type=`, result.type);
    if (result.type === "success" && result.url) {
      await createSessionFromUrl(result.url);
    }
  });
  await Promise.race([authStatePromise, browserResultPromise]);
  await Promise.allSettled([authStatePromise, browserResultPromise]);
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} signInWithGoogle session user=`, user?.id ?? null);
  if (!user) {
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} Google sign-in cancelled or failed (no session)`);
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
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} sendResetEmail start email=`, email);
  const resetRedirect = makeRedirectUri({ path: "create-new-password" });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetRedirect,
  });
  if (error) {
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} sendResetEmail failed:`, error.message);
    throw new Error(error.message);
  }
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} sendResetEmail success`);
}

export async function updatePassword(newPassword: string) {
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} updatePassword start`);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} updatePassword failed:`, error.message);
    throw new Error(error.message);
  }
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} updatePassword success`);
}

// ── Session validation ──────────────────────────────────────────────
// getSession() only reads the cached session from AsyncStorage — it NEVER
// hits the server. So if the user is deleted in the Supabase dashboard
// (auth.users row gone / refresh token revoked), the app would keep the
// stale session forever while offline and route straight into (tabs).
// validateSession() fixes that: when the device is online it calls
// getUser(), which verifies the JWT server-side. Auth rejections mean the
// account is gone → the cached session is purged (local scope, so it works
// even if the server already forgot us) and null is returned.
// Network failures mean "offline, can't tell" → the cached session is kept
// so offline mode keeps working.

function isNetworkError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.message} ${"cause" in err ? String((err as { cause?: unknown }).cause) : ""}`
      : String(err ?? "");
  return (
    err instanceof TypeError ||
    msg.includes("Network request failed") ||
    msg.includes("Failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("NetworkError") ||
    msg.includes("AbortError") ||
    msg.includes("aborted") ||
    msg.includes("timeout") ||
    msg.includes("TIMEOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("EAI_AGAIN")
  );
}

function isAuthRejection(message: string, status?: number): boolean {
  const m = message.toLowerCase();
  if (status === 401 || status === 403 || status === 404) return true;
  return (
    m.includes("user_not_found") ||
    m.includes("user from sub claim in jwt does not exist") ||
    m.includes("does not exist") ||
    m.includes("invalid jwt") ||
    m.includes("invalid token") ||
    m.includes("jwt expired") ||
    m.includes("refresh token") ||
    m.includes("session missing") ||
    m.includes("session_not_found") ||
    m.includes("auth session missing") ||
    m.includes("not authenticated") ||
    m.includes("not authorized") ||
    m.includes("token revoked")
  );
}

export async function signOutLocal(): Promise<void> {
  // scope:"local" only clears AsyncStorage — never touches the network, so
  // it works offline and for already-deleted users (global would 401/404).
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} signOutLocal start`);
  try {
    await supabase.auth.signOut({ scope: "local" });
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} signOutLocal done`);
  } catch (err) {
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} signOutLocal error (ignored):`, err);
    // Storage already cleared or unavailable — nothing left to do.
  }
}

export async function validateSession(): Promise<Session | null> {
  if (__DEV__) console.log(`[SkinLens][Auth] ${new Date().toISOString()} validateSession start`);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    if (__DEV__) console.log(`[SkinLens][Auth] ${new Date().toISOString()} validateSession no cached session`);
    return null;
  }
  if (__DEV__) console.log(`[SkinLens][Auth] ${new Date().toISOString()} validateSession cached user=`, session.user?.id);

  // Outer watchdog: getUser() goes through the global fetchWithTimeout
  // (10s), but supabase-js can still hang beyond that on a cold start
  // (phone just restarted, radio connecting — internal auth lock / DNS
  // hang that never settles). Never block boot on it: fail open to the
  // cached session so offline mode keeps working instead of sticking on
  // the splash loader forever.
  const VALIDATE_OUTER_TIMEOUT_MS = 12_000;
  let user;
  let error;
  try {
    const getUserPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("validateSession timeout")),
        VALIDATE_OUTER_TIMEOUT_MS,
      ),
    );
    ({ data: { user }, error } = await Promise.race([
      getUserPromise,
      timeoutPromise,
    ]));
  } catch (err) {
    // Thrown (rather than returned) errors are transport-level → offline.
    // Keep the cached session so offline mode keeps working.
    if (isNetworkError(err)) return session;
    console.warn("[auth] getUser threw, signing out locally:", err);
    await signOutLocal();
    return null;
  }

  if (__DEV__) console.log(`[SkinLens][Auth] ${new Date().toISOString()} validateSession getUser done hasUser=`, !!user, `error=`, error?.message ?? null);
  if (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: unknown }).status
        : undefined;
    if (isNetworkError(error)) return session;
    if (isAuthRejection(error.message ?? String(error), typeof status === "number" ? status : undefined)) {
      console.warn("[auth] session rejected by server, signing out locally:", error.message);
      await signOutLocal();
      return null;
    }
    // Unknown error — fail open (stay signed in) so transient server
    // issues don't log users out. Next reconnect retries validation.
    console.warn("[auth] getUser inconclusive, keeping cached session:", error.message);
    return session;
  }

  if (!user) {
    if (__DEV__) console.log(`[SkinLens][Auth] ${new Date().toISOString()} validateSession no user, signing out locally`);
    await signOutLocal();
    return null;
  }
  if (__DEV__) console.log(`[SkinLens][Auth] ${new Date().toISOString()} validateSession valid user=`, user.id);
  return session;
}
