import type { User } from "@supabase/supabase-js";

import { purgeMyCloudinaryImages } from "@/utils/cloudinary";
import { signInWithGoogle, signOutLocal, supabase } from "@/utils/supabase";

import { getDatabase } from "./database";

export async function requireUser(): Promise<User> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    if (__DEV__) console.log(`[SkinLens][Auth] ${new Date().toISOString()} requireUser no session`);
    throw new Error("You need to be signed in to continue.");
  }
  return user;
}

// Tables that hold user-scoped rows on-device. Wiped when the account is deleted server-side (or on
// explicit logout) so a stale session / the next login can never see the previous account's data.
const USER_TABLES = [
  "user_profile",
  "skin_profile",
  "lifestyle_profile",
  "results",
  "routines",
  "routine_progress",
  "sensitivity_history",
  "notifications",
] as const;

export async function clearLocalUserData(): Promise<void> {
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} clearLocalUserData start`);
  try {
    const db = await getDatabase();
    for (const table of USER_TABLES) {
      try {
        await db.runAsync(`DELETE FROM ${table}`);
        console.log(`[SkinLens][Auth] ${new Date().toISOString()} cleared table=`, table);
      } catch (err) {
        console.warn(`[auth] failed to clear ${table}:`, err);
      }
    }
    await db.runAsync(`DELETE FROM sync_queue`);
    console.log(`[SkinLens][Auth] ${new Date().toISOString()} clearLocalUserData done`);
  } catch (err) {
    console.warn("[auth] clearLocalUserData failed:", err);
  }
}

/** Permanently deletes the signed-in account (Google Play account-deletion policy). */
export async function deleteMyAccount(): Promise<void> {
  const user = await requireUser();

  const { data: files, error: listError } = await supabase.storage
    .from("reports")
    .list(user.id, { limit: 1000 });
  if (listError) {
    console.warn("[auth] could not list reports for deletion:", listError.message);
  } else if (files && files.length > 0) {
    const { error: removeError } = await supabase.storage
      .from("reports")
      .remove(files.map((f) => `${user.id}/${f.name}`));
    if (removeError) {
      console.warn("[auth] could not remove report files:", removeError.message);
    }
  }

  // Scan + face photos live on Cloudinary. Must run while the JWT is still valid (before the auth
  // user is deleted).
  await purgeMyCloudinaryImages();

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    throw new Error(
      /function .*delete_my_account/i.test(error.message)
        ? "Account deletion isn't available yet. Please contact support."
        : error.message,
    );
  }

  await signOutLocal();
  await clearLocalUserData();
}

/* ---------- Re-authentication for sensitive actions ----------
 * Used before replacing the enrolled face: otherwise anyone holding an unlocked, signed-in phone
 * could swap in their own face and pass the scan face check. */

export type ReauthMethod = "password" | "google";

/**
 * Every way this account can prove it's the owner. An account that signed up with email/password
 * and also signed in with Google using the same address has both identities linked (Supabase links
 * matching verified emails), so either one is accepted — the user may not remember a password
 * they no longer use.
 */
export async function getReauthMethods(): Promise<ReauthMethod[]> {
  const user = await requireUser();
  const providers =
    (user.app_metadata?.providers as string[] | undefined) ??
    [user.app_metadata?.provider as string | undefined].filter((p): p is string => !!p);
  const methods: ReauthMethod[] = [];
  // Accounts with an email identity have a password; Google-only accounts don't.
  if (providers.includes("email") || providers.length === 0) methods.push("password");
  if (providers.includes("google")) methods.push("google");
  return methods.length > 0 ? methods : ["password"];
}

export async function reauthenticateWithPassword(password: string): Promise<void> {
  const user = await requireUser();
  if (!user.email) throw new Error("This account has no email address to verify.");
  if (!password) throw new Error("Please enter your password.");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error) {
    throw new Error(
      /invalid login credentials/i.test(error.message)
        ? "Incorrect password. Please try again."
        : error.message,
    );
  }
  if (data.user?.id !== user.id) throw new Error("Couldn't verify this account.");
}

/**
 * Proves a fresh Google sign-in to the SAME account. `signInWithGoogle` falls back to the existing
 * session when the browser is dismissed, so a matching user id alone isn't proof — we also require
 * the server's `last_sign_in_at` to have advanced. If a different Google account was chosen, the
 * original session is restored.
 */
export async function reauthenticateWithGoogle(): Promise<void> {
  const {
    data: { session: before },
  } = await supabase.auth.getSession();
  if (!before) throw new Error("You need to be signed in to continue.");
  const { data: beforeUser, error: beforeErr } = await supabase.auth.getUser();
  if (beforeErr || !beforeUser.user) throw new Error("Connect to the internet to verify.");
  const userId = beforeUser.user.id;
  const lastSignIn = Date.parse(beforeUser.user.last_sign_in_at ?? "") || 0;

  await signInWithGoogle();

  const { data: afterUser } = await supabase.auth.getUser();
  const after = afterUser.user;
  if (!after) throw new Error("Google sign-in was cancelled or failed.");

  if (after.id !== userId) {
    // A different Google account was picked: put the original session back.
    await supabase.auth.setSession({
      access_token: before.access_token,
      refresh_token: before.refresh_token,
    });
    throw new Error("That Google account isn't the one signed in to SkinLens.");
  }
  const afterSignIn = Date.parse(after.last_sign_in_at ?? "") || 0;
  if (!(afterSignIn > lastSignIn)) {
    throw new Error("Google sign-in was cancelled. Please try again.");
  }
}

// Purge everything for an account that no longer exists server-side:
// AsyncStorage session (local scope — works offline/deleted) + SQLite rows.
export async function handleInvalidSession(): Promise<void> {
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleInvalidSession start`);
  await signOutLocal();
  await clearLocalUserData();
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleInvalidSession done`);
}
