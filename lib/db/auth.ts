<<<<<<< HEAD
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase";

export async function requireUser(): Promise<User> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
=======
import { supabase } from "@/utils/supabase";
import type { User } from "@supabase/supabase-js";

export async function requireUser(): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
  if (!user) throw new Error("You need to be signed in to continue.");
  return user;
}
