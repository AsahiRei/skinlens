import type { User } from "@supabase/supabase-js";

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

// Purge everything for an account that no longer exists server-side:
// AsyncStorage session (local scope — works offline/deleted) + SQLite rows.
export async function handleInvalidSession(): Promise<void> {
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleInvalidSession start`);
  await signOutLocal();
  await clearLocalUserData();
  console.log(`[SkinLens][Auth] ${new Date().toISOString()} handleInvalidSession done`);
}
