import type { User } from "@supabase/supabase-js";

import { purgeMyCloudinaryImages } from "@/utils/cloudinary";
import { signOutLocal, supabase } from "@/utils/supabase";

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

// Tables that hold user-scoped rows on-device. Wiped when the account is
// deleted server-side (or on explicit logout) so a stale session / the next
// login can never see the previous account's data.
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

/**
 * Permanently deletes the signed-in account (Google Play account-deletion
 * policy). Removes the user's report PDFs and Cloudinary photos, then calls
 * the delete_my_account RPC (migration 0010) which wipes every owned row and
 * the auth user, and finally clears this device. Requires a connection.
 */
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

  // Scan + face photos live on Cloudinary. Must run while the JWT is still
  // valid (before the auth user is deleted). Best effort: a failure is
  // logged, not fatal — the account rows are still removed.
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

// Purge everything for an account that no longer exists server-side:
// AsyncStorage session (local scope — works offline/deleted) + SQLite rows.
export async function handleInvalidSession(): Promise<void> {
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleInvalidSession start`);
  await signOutLocal();
  await clearLocalUserData();
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleInvalidSession done`);
}
