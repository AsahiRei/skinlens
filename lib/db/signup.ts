import type { User } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase";
import { setTutorialPending } from "@/lib/tutorial";

import {
  clearPendingDoctorSignup,
  readPendingDoctorSignup,
  redeemInviteCode,
} from "./appointments";
import { isDuplicateKeyError } from "./pg-errors";

export type SignupResult =
  | { kind: "patient" }
  | { kind: "doctor"; clinicName: string }
  /** Profile exists but the invite code couldn't be redeemed — finish on /doctor-setup. */
  | { kind: "doctor-pending"; error: unknown };

/**
 * Runs once the new account has a session (i.e. its email is verified): creates the profile row
 * and, for doctor sign-ups, redeems the invite code stored in user_metadata at sign-up.
 * Safe to re-run — a profile that already exists is left alone.
 */
export async function completeSignup(user: User): Promise<SignupResult> {
  const pending = readPendingDoctorSignup(user.user_metadata);
  const { error: insertError } = await supabase.from("user_profile").insert({
    id: user.id,
    username: pending?.displayName || undefined,
    first_name: pending?.displayName || undefined,
    email: user.email ?? "",
  });
  if (insertError && !isDuplicateKeyError(insertError)) throw insertError;

  if (!pending) return { kind: "patient" };

  // redeem_clinic_code() stamps role='doctor' + burns one code use.
  try {
    const res = await redeemInviteCode(pending.inviteCode, pending.displayName);
    // Best effort: a stale marker is harmless — /doctor-setup sees the doctors row and clears it.
    await clearPendingDoctorSignup().catch((e) =>
      console.warn("[signup] clear pending doctor marker failed:", e),
    );
    // Arm the doctor tour; the boot router starts it once it routes to /doctor.
    await setTutorialPending(user.id);
    return { kind: "doctor", clinicName: res.clinic_name };
  } catch (err) {
    return { kind: "doctor-pending", error: err };
  }
}

/** Sends a fresh sign-up verification code to `email`. */
export async function resendSignupCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw new Error(error.message);
}

/** Exchanges the emailed code for a session. Returns the verified user. */
export async function verifySignupCode(email: string, token: string): Promise<User> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) {
    throw new Error(
      /expired|invalid/i.test(error.message)
        ? "That code is invalid or has expired. Request a new one."
        : error.message,
    );
  }
  if (!data.user || !data.session) throw new Error("Couldn't verify your email. Please try again.");
  return data.user;
}
