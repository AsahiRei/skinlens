import { supabase } from "@/utils/supabase";
import type { User } from "@supabase/supabase-js";

export async function requireUser(): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You need to be signed in to continue.");
  return user;
}
