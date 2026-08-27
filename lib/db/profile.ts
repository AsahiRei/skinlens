import type {
  LifestyleProfile,
  SkinProfile,
  UserProfile,
} from "@/types/schema";
import { supabase } from "@/utils/supabase";

import { requireUser } from "./auth";
import { getDatabase } from "./database";
import { enqueueSync } from "./sync-queue";

function now() {
  return new Date().toISOString();
}

// Supabase query builders return PromiseLike, not Promise.
// This wrapper lets us .catch() on background refreshes.
function swallow(p: PromiseLike<unknown>) {
  Promise.resolve(p).catch(() => {});
}

// ── User Profile ──

export async function getUserProfile(): Promise<UserProfile | null> {
  const user = await requireUser();
  const db = await getDatabase();

  const local = await db.getFirstAsync<{
    id: string;
    username: string;
    email: string;
    age: string;
    phone_number: string;
    gender: string | null;
    user_setup: number | null;
    created_at: string;
  }>(`SELECT * FROM user_profile WHERE id = ?`, [user.id]);

  if (local) {
    // Refresh in background if online
    swallow(
      (async () => {
        const { data } = await supabase
          .from("user_profile")
          .select("*")
          .eq("id", user.id)
          .single();
        if (data) {
          await db.runAsync(
            `INSERT OR REPLACE INTO user_profile (id, username, email, age, phone_number, gender, user_setup, created_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              data.id,
              data.username,
              data.email,
              data.age ?? "",
              data.phone_number ?? "",
              data.gender ?? null,
              data.user_setup ? 1 : 0,
              data.created_at,
              now(),
            ],
          );
        }
      })(),
    );
    return {
      username: local.username,
      email: local.email,
      age: local.age,
      phone_number: local.phone_number,
      gender: local.gender ?? undefined,
      user_setup:
        local.user_setup === 1
          ? true
          : local.user_setup === 0
            ? false
            : undefined,
      created_at: local.created_at,
    };
  }

  // No local cache — fetch from server
  try {
    const { data, error } = await supabase
      .from("user_profile")
      .select("*")
      .eq("id", user.id)
      .single();
    if (error) throw error;

    await db.runAsync(
      `INSERT OR REPLACE INTO user_profile (id, username, email, age, phone_number, gender, user_setup, created_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.username,
        data.email,
        data.age ?? "",
        data.phone_number ?? "",
        data.gender ?? null,
        data.user_setup ? 1 : 0,
        data.created_at,
        now(),
      ],
    );
    return data;
  } catch {
    return null;
  }
}

export async function updateUserProfile(
  updates: Partial<Pick<UserProfile, "gender" | "user_setup">>,
): Promise<void> {
  const user = await requireUser();
  const db = await getDatabase();

  // Write locally
  if (updates.gender !== undefined) {
    await db.runAsync(`UPDATE user_profile SET gender = ? WHERE id = ?`, [
      updates.gender,
      user.id,
    ]);
  }
  if (updates.user_setup !== undefined) {
    await db.runAsync(`UPDATE user_profile SET user_setup = ? WHERE id = ?`, [
      updates.user_setup ? 1 : 0,
      user.id,
    ]);
  }

  // Queue sync
  await enqueueSync("user_profile", "update", user.id, {
    ...updates,
    id: user.id,
  });

  // Try sync now
  try {
    const { error } = await supabase
      .from("user_profile")
      .update(updates)
      .eq("id", user.id)
      .single();
    if (error) throw error;
  } catch {
    // Will be retried on next connectivity change
  }
}

export async function upsertUserProfile(profile: {
  id: string;
  username: string;
  email: string;
}): Promise<void> {
  const db = await getDatabase();
  const ts = now();

  await db.runAsync(
    `INSERT OR REPLACE INTO user_profile (id, username, email, age, phone_number, gender, user_setup, created_at, synced_at)
     VALUES (?, ?, ?, '', '', NULL, NULL, ?, ?)`,
    [profile.id, profile.username, profile.email, ts, ts],
  );

  await enqueueSync("user_profile", "upsert", profile.id, profile);

  try {
    const { error } = await supabase
      .from("user_profile")
      .upsert(
        { id: profile.id, username: profile.username, email: profile.email },
        { onConflict: "id", ignoreDuplicates: false },
      );
    if (error) throw error;
  } catch {
    // Will be retried
  }
}

// ── Skin Profile ──

export async function getSkinProfile(): Promise<SkinProfile | null> {
  const user = await requireUser();
  const db = await getDatabase();

  const local = await db.getFirstAsync<{
    id: string;
    skin_type: string;
    main_concerns: string;
  }>(`SELECT * FROM skin_profile WHERE id = ?`, [user.id]);

  if (local) {
    swallow(
      (async () => {
        const { data } = await supabase
          .from("skin_profile")
          .select("*")
          .eq("id", user.id)
          .single();
        if (data) {
          await db.runAsync(
            `INSERT OR REPLACE INTO skin_profile (id, skin_type, main_concerns, synced_at)
             VALUES (?, ?, ?, ?)`,
            [data.id, data.skin_type, data.main_concerns, now()],
          );
        }
      })(),
    );
    return { skin_type: local.skin_type, main_concerns: local.main_concerns };
  }

  try {
    const { data, error } = await supabase
      .from("skin_profile")
      .select("*")
      .eq("id", user.id)
      .single();
    if (error) throw error;

    await db.runAsync(
      `INSERT OR REPLACE INTO skin_profile (id, skin_type, main_concerns, synced_at)
       VALUES (?, ?, ?, ?)`,
      [data.id, data.skin_type, data.main_concerns, now()],
    );
    return data;
  } catch {
    return null;
  }
}

export async function upsertSkinProfile(
  profile: Pick<SkinProfile, "skin_type" | "main_concerns">,
): Promise<void> {
  const user = await requireUser();
  const db = await getDatabase();

  await db.runAsync(
    `INSERT OR REPLACE INTO skin_profile (id, skin_type, main_concerns, synced_at)
     VALUES (?, ?, ?, ?)`,
    [user.id, profile.skin_type, profile.main_concerns, now()],
  );

  await enqueueSync("skin_profile", "upsert", user.id, {
    ...profile,
    id: user.id,
  });

  try {
    const { error } = await supabase
      .from("skin_profile")
      .upsert({ id: user.id, ...profile })
      .single();
    if (error) throw error;
  } catch {
    // Will be retried
  }
}

// ── Lifestyle Profile ──

export async function getLifestyleProfile(): Promise<LifestyleProfile | null> {
  const user = await requireUser();
  const db = await getDatabase();

  const local = await db.getFirstAsync<{
    id: string;
    sleep_quality: string;
    water_intake: string;
    stress_level: string;
  }>(`SELECT * FROM lifestyle_profile WHERE id = ?`, [user.id]);

  if (local) {
    swallow(
      (async () => {
        const { data } = await supabase
          .from("lifestyle_profile")
          .select("*")
          .eq("id", user.id)
          .single();
        if (data) {
          await db.runAsync(
            `INSERT OR REPLACE INTO lifestyle_profile (id, sleep_quality, water_intake, stress_level, synced_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              data.id,
              data.sleep_quality,
              data.water_intake,
              data.stress_level,
              now(),
            ],
          );
        }
      })(),
    );
    return {
      sleep_quality: local.sleep_quality,
      water_intake: local.water_intake,
      stress_level: local.stress_level,
    };
  }

  try {
    const { data, error } = await supabase
      .from("lifestyle_profile")
      .select("*")
      .eq("id", user.id)
      .single();
    if (error) throw error;

    await db.runAsync(
      `INSERT OR REPLACE INTO lifestyle_profile (id, sleep_quality, water_intake, stress_level, synced_at)
       VALUES (?, ?, ?, ?, ?)`,
      [data.id, data.sleep_quality, data.water_intake, data.stress_level, now()],
    );
    return data;
  } catch {
    return null;
  }
}

export async function upsertLifestyleProfile(
  profile: Pick<
    LifestyleProfile,
    "sleep_quality" | "stress_level" | "water_intake"
  >,
): Promise<void> {
  const user = await requireUser();
  const db = await getDatabase();

  await db.runAsync(
    `INSERT OR REPLACE INTO lifestyle_profile (id, sleep_quality, water_intake, stress_level, synced_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      user.id,
      profile.sleep_quality,
      profile.water_intake,
      profile.stress_level,
      now(),
    ],
  );

  await enqueueSync("lifestyle_profile", "upsert", user.id, {
    ...profile,
    id: user.id,
  });

  try {
    const { error } = await supabase
      .from("lifestyle_profile")
      .upsert({ id: user.id, ...profile })
      .single();
    if (error) throw error;
  } catch {
    // Will be retried
  }
}

export async function getAllProfiles(): Promise<{
  userProfile: UserProfile | null;
  skinProfile: SkinProfile | null;
  lifestyleProfile: LifestyleProfile | null;
}> {
  const [userProfile, skinProfile, lifestyleProfile] = await Promise.all([
    getUserProfile(),
    getSkinProfile(),
    getLifestyleProfile(),
  ]);
  return { userProfile, skinProfile, lifestyleProfile };
}
