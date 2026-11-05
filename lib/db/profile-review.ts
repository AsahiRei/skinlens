import { supabase } from "@/utils/supabase";

import { isMissingFunctionError } from "./pg-errors";

export type ProfileValidationStatus = "confirmed" | "needs_review";

/** The doctor's latest verdict on a patient's profile (migration 0012). */
export type ProfileValidation = {
  status: ProfileValidationStatus;
  doctor_notes: string | null;
  validator_name: string | null;
  validated_at: string;
  /** False once the patient edited their profile / sensitivity history. */
  is_current: boolean;
};

export type ReviewSensitivityEntry = {
  id: number;
  trigger_cause: string;
  severity: string;
  notes: string | null;
  occurred_at: string;
};

/** Exactly the profile data a dermatologist reviews. */
export type ReviewableProfile = {
  first_name: string | null;
  age: string | null;
  gender: string | null;
  skin_type: string | null;
  main_concerns: string | null;
  sleep_quality: string | null;
  water_intake: string | null;
  stress_level: string | null;
  sensitivity: ReviewSensitivityEntry[];
};

export type PatientProfileReview = {
  profile: ReviewableProfile;
  validation: ProfileValidation | null;
};

const MIGRATION_HINT =
  "Profile reviews aren't available yet: the clinic database is missing supabase/migrations/0012_profile_validation.sql. Ask the clinic admin to run it once in the Supabase SQL editor, then reopen.";

function rpcError(error: { message: string }): Error {
  if (isMissingFunctionError(error)) return new Error(MIGRATION_HINT);
  return new Error(error.message);
}

/**
 * Doctor side: one patient's profile data plus the current verdict. The RPC
 * checks the caller is an active doctor whose clinic has an active
 * appointment with this patient.
 */
export async function getPatientProfileForReview(
  patientId: string,
): Promise<PatientProfileReview> {
  const { data, error } = await supabase.rpc("get_patient_profile_for_review", {
    p_patient_id: patientId,
  });
  if (error) throw rpcError(error);
  const review = data as PatientProfileReview;
  return {
    profile: { ...review.profile, sensitivity: review.profile?.sensitivity ?? [] },
    validation: review.validation ?? null,
  };
}

/**
 * Doctor side: confirm the profile or flag it for follow-up. The server
 * snapshots the reviewed data so later patient edits mark it outdated.
 */
export async function validatePatientProfile(
  patientId: string,
  status: ProfileValidationStatus,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("validate_patient_profile", {
    p_patient_id: patientId,
    p_status: status,
    p_notes: notes,
  });
  if (error) throw rpcError(error);
}

/**
 * Patient side: the verdict on their own profile, or null when no
 * dermatologist has reviewed it yet. Throws when offline / not migrated —
 * callers treat that as "unknown" and hide the badge.
 */
export async function getMyProfileValidation(): Promise<ProfileValidation | null> {
  const { data, error } = await supabase.rpc("get_my_profile_validation");
  if (error) throw rpcError(error);
  return (data as ProfileValidation | null) ?? null;
}
