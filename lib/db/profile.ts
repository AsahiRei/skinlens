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
    first_name: string | null;
    email: string;
    age: string;
    gender: string | null;
    user_setup: number | null;
    face_image_url: string | null;
    face_embedding: string | null;
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
            `INSERT OR REPLACE INTO user_profile (id, username, first_name, email, age, gender, user_setup, face_image_url, face_embedding, created_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              data.id,
              data.username,
              data.first_name ?? null,
              data.email,
              data.age ?? "",
              data.gender ?? null,
              data.user_setup ? 1 : 0,
              (data as { face_image_url?: string | null }).face_image_url ?? null,
              (data as { face_embedding?: string | null }).face_embedding ?? null,
              data.created_at,
              now(),
            ],
          );
        }
      })(),
    );
    return {
      username: local.username,
      first_name: local.first_name ?? undefined,
      email: local.email,
      age: local.age,
      gender: local.gender ?? undefined,
      user_setup:
        local.user_setup === 1
          ? true
          : local.user_setup === 0
            ? false
            : undefined,
      face_image_url: local.face_image_url ?? null,
      face_embedding: local.face_embedding ?? null,
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
      `INSERT OR REPLACE INTO user_profile (id, username, first_name, email, age, gender, user_setup, face_image_url, face_embedding, created_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.username,
        data.first_name ?? null,
        data.email,
        data.age ?? "",
        data.gender ?? null,
        data.user_setup ? 1 : 0,
        (data as { face_image_url?: string | null }).face_image_url ?? null,
        (data as { face_embedding?: string | null }).face_embedding ?? null,
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
  updates: Partial<
    Pick<
      UserProfile,
      | "gender"
      | "user_setup"
      | "first_name"
      | "age"
      | "face_image_url"
      | "face_embedding"
    >
  >,
): Promise<void> {
  const user = await requireUser();
  const db = await getDatabase();

  // Fresh accounts (just registered) only exist server-side — Register.tsx
  // never writes a local row. Without this, every UPDATE below hits zero
  // rows and later local reads (e.g. the face-enroll guard in loading.tsx)
  // see nothing, bouncing the user back in a loop.
  await db.runAsync(
    `INSERT OR IGNORE INTO user_profile (id, email, synced_at) VALUES (?, ?, ?)`,
    [user.id, user.email ?? "", now()],
  );

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
  if (updates.first_name !== undefined) {
    await db.runAsync(`UPDATE user_profile SET first_name = ? WHERE id = ?`, [
      updates.first_name,
      user.id,
    ]);
  }
  if (updates.age !== undefined) {
    await db.runAsync(`UPDATE user_profile SET age = ? WHERE id = ?`, [
      updates.age,
      user.id,
    ]);
  }
  if (updates.face_image_url !== undefined) {
    await db.runAsync(`UPDATE user_profile SET face_image_url = ? WHERE id = ?`, [
      updates.face_image_url,
      user.id,
    ]);
  }
  if (updates.face_embedding !== undefined) {
    await db.runAsync(`UPDATE user_profile SET face_embedding = ? WHERE id = ?`, [
      updates.face_embedding,
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
  // Sequential: the app shares a single SQLite handle and concurrent
  // prepare/execute/finalize lifecycles corrupt it on Android (expo#48995).
  const userProfile = await getUserProfile();
  const skinProfile = await getSkinProfile();
  const lifestyleProfile = await getLifestyleProfile();
  return { userProfile, skinProfile, lifestyleProfile };
}

// ── Face identity (enrollment + verification) ──

export type FaceIdentity = {
  face_image_url: string | null;
  face_embedding: string | null;
};

// Local-first read: verification must work offline, so the SQLite mirror is
// authoritative here (server refresh happens inside getUserProfile anyway).
export async function getFaceIdentity(): Promise<FaceIdentity | null> {
  const user = await requireUser();
  const db = await getDatabase();
  const local = await db.getFirstAsync<{
    face_image_url: string | null;
    face_embedding: string | null;
  }>(`SELECT face_image_url, face_embedding FROM user_profile WHERE id = ?`, [
    user.id,
  ]);
  if (!local) return null;
  if (!local.face_image_url && !local.face_embedding) return null;
  return {
    face_image_url: local.face_image_url,
    face_embedding: local.face_embedding,
  };
}

// Saves enrollment locally, queues the sync, and pushes to Supabase when
// online (same write-through pattern as updateUserProfile). Requires the
// server-side ALTER TABLE (face_image_url / face_embedding) to be applied.
export async function saveFaceIdentity(identity: FaceIdentity): Promise<void> {
  await updateUserProfile({
    face_image_url: identity.face_image_url,
    face_embedding: identity.face_embedding,
  });
}
