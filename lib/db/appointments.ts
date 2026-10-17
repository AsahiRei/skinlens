import { supabase } from "@/utils/supabase";

import { requireUser } from "./auth";
import { isDuplicateKeyError, isMissingColumnError } from "./pg-errors";

export type AppointmentStatus =
  | "requested"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "declined";

export type DoctorRow = {
  user_id: string;
  clinic_id: string;
  display_name: string;
  specialty: string;
  is_active: boolean;
};

export type AppointmentRow = {
  id: string;
  patient_id: string;
  clinic_id: string;
  doctor_id: string | null;
  report_pdf_path: string | null;
  /** Snapshot of the patient's display name at booking time (0005 migration).
   * Lets the doctor queue show a name without needing user_profile access.
   * Null on rows booked before the migration was applied. */
  patient_name: string | null;
  /** Snapshot of the patient's remote profile-photo URL at booking time
   * (0006 migration). Only http(s) URLs are stored — local file:// photos
   * can't be shown on another device. */
  patient_avatar_url: string | null;
  preferred_time: string | null;
  scheduled_at: string | null;
  status: AppointmentStatus;
  created_at: string;
};

export type DoctorProfile = {
  clinicId: string;
  clinicName: string;
  displayName: string;
  specialty: string;
};

/** "patient" by default; "doctor" after redeeming a clinic invite code. */
export async function getUserRole(): Promise<"patient" | "doctor"> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("user_profile")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { role?: string } | null)?.role === "doctor"
    ? "doctor"
    : "patient";
}

/**
 * Doctor self-registration (mirrors redeem_clinic_code in 0002 migration).
 * Call AFTER signUp + user_profile insert, while signed in.
 * Returns the clinic the code tied the doctor to.
 */
export async function redeemInviteCode(
  code: string,
  displayName: string,
  specialty = "Dermatology",
): Promise<{ clinic_id: string; clinic_name: string }> {
  const { data, error } = await supabase.rpc("redeem_clinic_code", {
    p_code: code.trim(),
    p_display_name: displayName.trim(),
    p_specialty: specialty.trim() || "Dermatology",
  });
  if (error) throw new Error(error.message);
  const row = data as { clinic_id: string; clinic_name: string };
  if (!row?.clinic_id) throw new Error("Invalid invite code.");
  return row;
}

/** The signed-in doctor's row + clinic name (null when not a doctor). */
export async function getMyDoctorProfile(): Promise<DoctorProfile | null> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("doctors")
    .select("clinic_id, display_name, specialty")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as {
    clinic_id: string;
    display_name: string;
    specialty: string;
  };
  let clinicName = "My clinic";
  try {
    const { data: c } = await supabase
      .from("clinics")
      .select("name")
      .eq("id", d.clinic_id)
      .maybeSingle();
    if (c) clinicName = (c as { name: string }).name;
  } catch {
    /* name is best-effort */
  }
  return {
    clinicId: d.clinic_id,
    clinicName,
    displayName: d.display_name || "Doctor",
    specialty: d.specialty || "Dermatology",
  };
}

/** Active doctors of one verified clinic (for the booking doctor picker). */
export async function getDoctorsForClinic(
  clinicId: string,
): Promise<DoctorRow[]> {
  const { data, error } = await supabase
    .from("doctors")
    .select("user_id, clinic_id, display_name, specialty, is_active")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .order("display_name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as DoctorRow[]).filter((d) => d.is_active !== false);
}

/** Patient creates a booking request at a verified clinic. */
export async function requestAppointment(input: {
  clinicId: string;
  doctorId?: string | null;
  preferredTime?: string | null;
  reportPdfPath?: string | null;
  /** Snapshot of the patient's display name (shown to the doctor even when
   * user_profile rows aren't readable). Ignored when null. */
  patientName?: string | null;
  /** Snapshot of the patient's remote profile-photo URL (http(s) only).
   * Ignored when null. */
  patientAvatarUrl?: string | null;
}): Promise<AppointmentRow> {
  const user = await requireUser();
  const base = {
    patient_id: user.id,
    clinic_id: input.clinicId,
    doctor_id: input.doctorId ?? null,
    preferred_time: input.preferredTime ?? null,
    report_pdf_path: input.reportPdfPath ?? null,
    status: "requested",
  };
  // Prefer storing the snapshots (0005/0006 migrations). When a migration
  // hasn't been applied yet its column doesn't exist — retry with fewer
  // extras so booking never breaks.
  const attempts: Record<string, string>[] = [{}];
  if (input.patientName) {
    attempts.unshift({ patient_name: input.patientName });
  }
  if (input.patientName && input.patientAvatarUrl) {
    attempts.unshift({
      patient_name: input.patientName,
      patient_avatar_url: input.patientAvatarUrl,
    });
  }
  let lastError = "";
  for (const extra of attempts) {
    const { data, error } = await supabase
      .from("appointments")
      .insert({ ...base, ...extra })
      .select()
      .single();
    if (!error) return data as AppointmentRow;
    if (!isMissingColumnError(error)) throw new Error(error.message);
    lastError = error.message;
    console.warn(
      "[appointments] snapshot column missing, retrying with less:",
      error.message,
    );
  }
  throw new Error(lastError || "Couldn't create the appointment.");
}

/**
 * Patient attaches the generated Skin Report PDF path to their own
 * appointment row (RLS: patient update own). Called right after the
 * PDF is uploaded to the `reports/<uid>/<appointment_id>.pdf` key.
 */
export async function attachReportToAppointment(
  id: string,
  reportPath: string,
): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase
    .from("appointments")
    .update({ report_pdf_path: reportPath })
    .eq("id", id)
    .eq("patient_id", user.id);
  if (error) throw new Error(error.message);
}

/** Patient's own requests, newest first. */
export async function getMyAppointments(): Promise<AppointmentRow[]> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("patient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppointmentRow[];
}

/** Patient cancels their own request (RLS: patient update own). */
export async function cancelAppointment(id: string): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("patient_id", user.id);
  if (error) throw new Error(error.message);
}

/**
 * Doctor's queue: every appointment at THEIR clinic (RLS: doctor select own
 * clinic). Patient/doctor display names are resolved by the caller.
 */
export async function getClinicAppointments(
  clinicId: string,
): Promise<AppointmentRow[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppointmentRow[];
}

/** Friendly copy for a slot that is already held by another visit. */
export const SLOT_TAKEN_MESSAGE =
  "That time slot is already booked at your clinic — pick a different date & time.";

/**
 * True when a CONFIRMED visit already occupies this exact minute for the
 * doctor being scheduled (an unassigned scheduled row counts too, so the
 * clinic never double-books a slot). Checked client-side before every
 * schedule write; the partial unique index from migration 0007 is the
 * backstop for races.
 */
async function hasSlotConflict(
  appointmentId: string,
  clinicId: string,
  scheduledAt: string,
  doctorId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, doctor_id")
    .eq("clinic_id", clinicId)
    .eq("status", "scheduled")
    .eq("scheduled_at", scheduledAt)
    .neq("id", appointmentId)
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).some(
    (row) => row.doctor_id === null || row.doctor_id === doctorId,
  );
}

/**
 * Doctor schedules / completes / declines (RLS: doctor update own clinic).
 * Pass scheduledAt (ISO) when moving requested → scheduled.
 * Rejects a slot that another confirmed visit already holds.
 */
export async function updateAppointment(
  id: string,
  input: {
    status: AppointmentStatus;
    scheduledAt?: string | null;
    claimAsDoctor?: boolean;
  },
): Promise<void> {
  const user = await requireUser();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.scheduledAt !== undefined) patch.scheduled_at = input.scheduledAt;
  if (input.claimAsDoctor) patch.doctor_id = user.id;

  if (input.status === "scheduled" && input.scheduledAt) {
    const { data: row, error: rowError } = await supabase
      .from("appointments")
      .select("clinic_id")
      .eq("id", id)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row) {
      throw new Error(
        "Couldn't find that appointment — pull to refresh and try again.",
      );
    }
    const clinicId = (row as { clinic_id: string }).clinic_id;
    if (await hasSlotConflict(id, clinicId, input.scheduledAt, user.id)) {
      throw new Error(SLOT_TAKEN_MESSAGE);
    }
  }

  const { error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", id);
  if (error) {
    // Lost a race against the unique slot index (migration 0007).
    if (isDuplicateKeyError(error)) throw new Error(SLOT_TAKEN_MESSAGE);
    throw new Error(error.message);
  }
}

/**
 * Display name for a patient row. Always carries the human identifier
 * (first name / username) so the doctor never sees a bare "Patient".
 * Falls back to "Patient" only when the profile has no usable name.
 */
export function formatPatientDisplayName(input: {
  username?: string | null;
  first_name?: string | null;
}): string {
  const username = (input.username ?? "").trim();
  const firstName = (input.first_name ?? "").trim();
  if (firstName && username) return `${firstName} (@${username})`;
  if (firstName) return firstName;
  if (username) return username.startsWith("@") ? username : `@${username}`;
  return "Patient";
}

/** "Patient · <name>" subtitle so the role label and username show together. */
export function formatPatientSubtitle(displayName: string): string {
  if (!displayName || displayName === "Patient") return "Patient";
  return `Patient · ${displayName}`;
}

/**
 * Preferred display name for one appointment in the doctor queue:
 * live-resolved profile name first, then the booking-time snapshot, then
 * the "Patient" fallback.
 */
export function patientDisplayFor(
  row: Pick<AppointmentRow, "patient_id" | "patient_name">,
  names: Record<string, string>,
): string {
  const live = names[row.patient_id];
  if (live && live !== "Patient") return live;
  const snap = (row.patient_name ?? "").trim();
  if (snap) return snap;
  return live ?? "Patient";
}

/** Only remote photos can be shown on another device. */
export function isRemoteImageUrl(value: string | null | undefined): boolean {
  return !!value && /^https?:\/\//i.test(value.trim());
}

type PatientNameRow = {
  id: string;
  username: string | null;
  first_name: string | null;
  face_image_url?: string | null;
};

function applyPatientNameRows(
  patientNames: Record<string, string>,
  patientAvatars: Record<string, string>,
  list: PatientNameRow[] | null | undefined,
): void {
  for (const p of list ?? []) {
    if (!p?.id) continue;
    patientNames[p.id] = formatPatientDisplayName(p);
    if (isRemoteImageUrl(p.face_image_url)) {
      patientAvatars[p.id] = (p.face_image_url as string).trim();
    }
  }
}

/**
 * Preferred avatar URL for one appointment in the doctor queue:
 * live-resolved photo first, then the booking-time snapshot.
 */
export function patientAvatarFor(
  row: Pick<AppointmentRow, "patient_id" | "patient_avatar_url">,
  avatars: Record<string, string>,
): string | null {
  const live = avatars[row.patient_id];
  if (isRemoteImageUrl(live)) return live.trim();
  if (isRemoteImageUrl(row.patient_avatar_url)) {
    return (row.patient_avatar_url as string).trim();
  }
  return null;
}

/** Batch display names for appointment rows (usernames + doctor names). */
export async function resolveAppointmentNames(rows: AppointmentRow[]): Promise<{
  patientNames: Record<string, string>;
  patientAvatars: Record<string, string>;
  doctorNames: Record<string, string>;
  clinicNames: Record<string, string>;
}> {
  const patientNames: Record<string, string> = {};
  const patientAvatars: Record<string, string> = {};
  const doctorNames: Record<string, string> = {};
  const clinicNames: Record<string, string> = {};
  const patientIds = [...new Set(rows.map((r) => r.patient_id))];
  const doctorIds = [
    ...new Set(rows.map((r) => r.doctor_id).filter((v): v is string => !!v)),
  ];
  const clinicIds = [...new Set(rows.map((r) => r.clinic_id))];
  // Booking-time snapshots first — the doctor queue can show these even
  // when user_profile rows aren't readable under RLS (newest row wins).
  for (const r of rows) {
    const snap = (r.patient_name ?? "").trim();
    if (snap && !patientNames[r.patient_id]) {
      patientNames[r.patient_id] = snap;
    }
    if (
      !patientAvatars[r.patient_id] &&
      isRemoteImageUrl(r.patient_avatar_url)
    ) {
      patientAvatars[r.patient_id] = (r.patient_avatar_url as string).trim();
    }
  }
  const unresolved = () =>
    patientIds.filter(
      (id) => !patientNames[id] || patientNames[id] === "Patient",
    );
  try {
    let ids = unresolved();
    if (ids.length > 0) {
      // 1. Doctor-safe lookup (0005 migration, SECURITY DEFINER): returns
      // only id/username/first_name for the caller's own clinic patients.
      // Falls through to direct selects when the function isn't installed.
      try {
        const { data, error } = await supabase.rpc(
          "get_patient_display_names",
          { p_ids: ids },
        );
        if (error) throw error;
        applyPatientNameRows(
          patientNames,
          patientAvatars,
          data as PatientNameRow[],
        );
      } catch (rpcErr) {
        console.warn(
          "[appointments] patient-name RPC unavailable, trying direct read:",
          rpcErr instanceof Error ? rpcErr.message : rpcErr,
        );
        // 2. Direct read (works when RLS permits + columns exist).
        // face_image_url may also be missing server-side — retry without
        // it on column errors.
        ids = unresolved();
        if (ids.length > 0) {
          try {
            const { data, error } = await supabase
              .from("user_profile")
              .select("id, username, first_name, face_image_url")
              .in("id", ids);
            if (error) throw error;
            applyPatientNameRows(
              patientNames,
              patientAvatars,
              data as PatientNameRow[],
            );
          } catch (directErr) {
            if (!isMissingColumnError({ message: directErr instanceof Error ? directErr.message : String(directErr) })) throw directErr;
            const { data, error } = await supabase
              .from("user_profile")
              .select("id, username, first_name")
              .in("id", ids);
            if (error) throw error;
            applyPatientNameRows(
              patientNames,
              patientAvatars,
              data as PatientNameRow[],
            );
          }
        }
      }
    }
  } catch (err) {
    // 3. Last resort: the server may lack the first_name column (0005 not
    // applied) — retry with username only instead of showing "Patient".
    console.warn(
      "[appointments] patient-name lookup failed, retrying username-only:",
      err instanceof Error ? err.message : err,
    );
    try {
      const ids = unresolved();
      if (ids.length > 0) {
        const { data, error } = await supabase
          .from("user_profile")
          .select("id, username")
          .in("id", ids);
        if (error) throw error;
        applyPatientNameRows(
          patientNames,
          patientAvatars,
          (data as { id: string; username: string | null }[]).map((p) => ({
            ...p,
            first_name: null,
          })),
        );
      }
    } catch (retryErr) {
      // RLS-blocked (own-rows-only user_profile): snapshots above still
      // stand, remaining ids keep the "Patient" fallback.
      console.warn(
        "[appointments] username-only lookup failed:",
        retryErr instanceof Error ? retryErr.message : retryErr,
      );
    }
  }
  try {
    if (doctorIds.length > 0) {
      const { data } = await supabase
        .from("doctors")
        .select("user_id, display_name")
        .in("user_id", doctorIds);
      for (const d of (data ?? []) as {
        user_id: string;
        display_name: string;
      }[]) {
        doctorNames[d.user_id] = d.display_name || "Doctor";
      }
    }
  } catch {
    /* best-effort */
  }
  try {
    if (clinicIds.length > 0) {
      const { data } = await supabase
        .from("clinics")
        .select("id, name")
        .in("id", clinicIds);
      for (const c of (data ?? []) as { id: string; name: string }[]) {
        clinicNames[c.id] = c.name;
      }
    }
  } catch {
    /* best-effort */
  }
  return { patientNames, patientAvatars, doctorNames, clinicNames };
}
