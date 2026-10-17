import type { ValidationStatus } from "@/types/schema";
import { supabase } from "@/utils/supabase";

import { isMissingFunctionError } from "./pg-errors";

/** Row returned by the get_patient_latest_result RPC (migration 0007). */
export type PatientResultSummary = {
  id: number;
  severity: string;
  healthscore: number;
  confidence: number | null;
  detection_label: string | null;
  validation_status: ValidationStatus;
  doctor_notes: string | null;
  validated_at: string | null;
  created_at: string;
};

const MIGRATION_HINT =
  "Reviews aren't available yet: the clinic database is missing supabase/migrations/0007_result_validation.sql. Ask the clinic admin to run it once in the Supabase SQL editor, then reopen.";

function rpcError(error: { message: string }): Error {
  if (isMissingFunctionError(error)) return new Error(MIGRATION_HINT);
  return new Error(error.message);
}

/**
 * Reads one patient's newest AI result. The RPC checks the caller is an
 * active doctor whose clinic holds an active appointment for that patient,
 * and returns no image / survey data — just what the review panel needs.
 * Throws with a friendly message when the 0007 migration isn't applied yet.
 */
export async function getPatientLatestResult(
  patientId: string,
): Promise<PatientResultSummary | null> {
  const { data, error } = await supabase.rpc("get_patient_latest_result", {
    p_patient_id: patientId,
  });
  if (error) throw rpcError(error);
  return (data as PatientResultSummary | null) ?? null;
}

/**
 * Writes the dermatologist verdict. Only status + notes are sent; the RPC
 * sets validated_by / validated_at itself and can never alter scores or
 * detection. Same migration hint when the RPC doesn't exist yet.
 */
export async function validateAiResult(
  resultId: number,
  status: Extract<ValidationStatus, "confirmed" | "needs_review">,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("validate_ai_result", {
    p_result_id: resultId,
    p_status: status,
    p_notes: notes,
  });
  if (error) throw rpcError(error);
}
