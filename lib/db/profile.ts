import { supabase } from "@/utils/supabase";
import { requireUser } from "./auth";
import type { UserProfile, SkinProfile, LifestyleProfile } from "@/types/schema";

export async function getUserProfile(): Promise<UserProfile> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("user_profile")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserProfile(
  updates: Partial<Pick<UserProfile, "gender" | "user_setup">>,
): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase
    .from("user_profile")
    .update(updates)
    .eq("id", user.id)
    .single();
  if (error) throw error;
}

export async function upsertUserProfile(
  profile: { id: string; username: string; email: string },
): Promise<void> {
  const { error } = await supabase.from("user_profile").upsert(
    { id: profile.id, username: profile.username, email: profile.email },
    { onConflict: "id", ignoreDuplicates: false },
  );
  if (error) throw error;
}

export async function getSkinProfile(): Promise<SkinProfile> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("skin_profile")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function upsertSkinProfile(
  profile: Pick<SkinProfile, "skin_type" | "main_concerns">,
): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase
    .from("skin_profile")
    .upsert({ id: user.id, ...profile })
    .single();
  if (error) throw error;
}

export async function getLifestyleProfile(): Promise<LifestyleProfile> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("lifestyle_profile")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function upsertLifestyleProfile(
  profile: Pick<LifestyleProfile, "sleep_quality" | "stress_level" | "water_intake">,
): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase
    .from("lifestyle_profile")
    .upsert({ id: user.id, ...profile })
    .single();
  if (error) throw error;
}

export async function getAllProfiles(): Promise<{
  userProfile: UserProfile;
  skinProfile: SkinProfile;
  lifestyleProfile: LifestyleProfile;
}> {
  const user = await requireUser();
  const [
    { data: userProfile, error: userErr },
    { data: skinProfile, error: skinErr },
    { data: lifestyleProfile, error: lifestyleErr },
  ] = await Promise.all([
    supabase.from("user_profile").select("*").eq("id", user.id).single(),
    supabase.from("skin_profile").select("*").eq("id", user.id).single(),
    supabase.from("lifestyle_profile").select("*").eq("id", user.id).single(),
  ]);
  if (userErr) throw userErr;
  if (skinErr) throw skinErr;
  if (lifestyleErr) throw lifestyleErr;
  return { userProfile, skinProfile, lifestyleProfile };
}
