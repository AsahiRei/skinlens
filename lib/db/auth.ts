import type { User } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase";

export async function requireUser(): Promise<User> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("You need to be signed in to continue.");
  return user;
}
