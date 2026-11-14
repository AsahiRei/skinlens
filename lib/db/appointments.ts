import { supabase } from "@/utils/supabase";

import { requireUser } from "./auth";
import { isDuplicateKeyError, isMissingColumnError, isMissingFunctionError } from "./pg-errors";

export type AppointmentStatus =
  | "requested"
  /** The slot the patient asked for was given to another visit (0015 migration). */
  | "needs_reschedule"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "declined";

/** Still waiting on the clinic: a fresh request, or one bumped because its slot was taken. */
export function isPendingStatus(status: AppointmentStatus): boolean {
  return status === "requested" || status === "needs_reschedule";
}

/** Length of one visit slot. Mirrors `appointment_slot_length()` in the 0015 migration. */
export const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;

/**
 * When "Mark as done" unlocks: the visit's scheduled time. Null when the row isn't a scheduled visit.
 * The server enforces the same rule with its own clock.
 */
export function completionOpensAt(a: Pick<AppointmentRow, "status" | "scheduled_at">): Date | null {
  if (a.status !== "scheduled" || !a.scheduled_at) return null;
  const t = Date.parse(a.scheduled_at);
  return Number.isFinite(t) ? new Date(t) : null;
}

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
  /** Snapshot of the patient's display name at booking time (0005 migration). */
  patient_name: string | null;
  /** Snapshot of the patient's remote profile-photo URL at booking time (0006 migration). */
  patient_avatar_url: string | null;
  preferred_time: string | null;
  scheduled_at: string | null;
  status: AppointmentStatus;
  created_at: string;
};

export type DoctorProfile = {
  /** The doctor's auth user id (= doctors.user_id). */
  userId: string;
  clinicId: string;
  clinicName: string;
  /** Hospital street address ("" when the clinic row has none). */
  clinicAddress: string;
  clinicLatitude: number | null;
  clinicLongitude: number | null;
  /** Clinic opening-hours text ("" when unknown) — lays out the booking grid. */
  clinicHours: string;
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
  return (data as { role?: string } | null)?.role === "doctor" ? "doctor" : "patient";
}

/**
 * Read-only invite-code check (0014 migration) — run BEFORE signUp so a bad code never creates an
 * orphan auth account.
 */
export async function checkInviteCode(
  code: string,
): Promise<{ clinic_id: string; clinic_name: string } | null> {
  const { data, error } = await supabase.rpc("check_clinic_code", {
    p_code: code.trim(),
  });
  if (error) {
    if (isMissingFunctionError(error)) {
      console.warn("[appointments] check_clinic_code missing — apply 0014 migration");
      return null;
    }
    throw new Error(error.message);
  }
  const row = data as { clinic_id: string; clinic_name: string } | null;
  if (!row?.clinic_id) throw new Error("Invalid invite code.");
  return row;
}

/**
 * A doctor sign-up whose invite code hasn't been redeemed yet (email confirmation was pending, or
 * the redeem failed).
 */
export type PendingDoctorSignup = { inviteCode: string; displayName: string };

export function readPendingDoctorSignup(
  metadata: Record<string, unknown> | null | undefined,
): PendingDoctorSignup | null {
  const code = metadata?.pending_invite_code;
  if (typeof code !== "string" || !code.trim()) return null;
  const name = metadata?.pending_display_name;
  return {
    inviteCode: code.trim().toUpperCase(),
    displayName: typeof name === "string" ? name.trim() : "",
  };
}

/** Drop the pending-doctor marker (after a redeem, or "continue as patient"). */
export async function clearPendingDoctorSignup(): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { pending_invite_code: null, pending_display_name: null },
  });
  if (error) throw new Error(error.message);
}

/** Doctor self-registration (mirrors redeem_clinic_code in 0002 migration). */
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
  let clinicAddress = "";
  let clinicLatitude: number | null = null;
  let clinicLongitude: number | null = null;
  let clinicHours = "";
  try {
    const { data: c } = await supabase
      .from("clinics")
      .select("name, address, latitude, longitude, hours")
      .eq("id", d.clinic_id)
      .maybeSingle();
    if (c) {
      const row = c as {
        name: string;
        address?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        hours?: string | null;
      };
      clinicName = row.name;
      clinicHours = row.hours?.trim() ?? "";
      clinicAddress = row.address?.trim() ?? "";
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (
        row.latitude != null &&
        row.longitude != null &&
        Number.isFinite(lat) &&
        Number.isFinite(lng)
      ) {
        clinicLatitude = lat;
        clinicLongitude = lng;
      }
    }
  } catch {
    /* clinic details are best-effort */
  }
  return {
    userId: user.id,
    clinicId: d.clinic_id,
    clinicName,
    clinicAddress,
    clinicLatitude,
    clinicLongitude,
    clinicHours,
    displayName: d.display_name || "Doctor",
    specialty: d.specialty || "Dermatology",
  };
}

/**
 * Doctor edits their own display name / specialty (migration 0011 —
 * update_my_doctor_profile, which can't touch clinic_id or is_active).
 */
export async function updateMyDoctorProfile(input: {
  displayName: string;
  specialty: string;
}): Promise<void> {
  const displayName = input.displayName.trim();
  if (displayName.length < 2) throw new Error("Enter your display name.");
  const { error } = await supabase.rpc("update_my_doctor_profile", {
    p_display_name: displayName,
    p_specialty: input.specialty.trim() || null,
  });
  if (error) {
    if (/function .*update_my_doctor_profile/i.test(error.message)) {
      throw new Error("Profile editing isn't set up on the server yet (migration 0011).");
    }
    throw new Error(error.message);
  }
}

/** Active doctors of one verified clinic (for the booking doctor picker). */
export async function getDoctorsForClinic(clinicId: string): Promise<DoctorRow[]> {
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
  // Hard backstop (the booking screen already blocks this with a modal): never persist a preferred
  // slot that has already passed — the picked value can go stale while the form sits open.
  if (input.preferredTime) {
    const at = Date.parse(input.preferredTime);
    if (Number.isFinite(at) && at <= Date.now()) {
      throw new Error(PAST_TIME_MESSAGE);
    }
  }
  const user = await requireUser();
  const base = {
    patient_id: user.id,
    clinic_id: input.clinicId,
    doctor_id: input.doctorId ?? null,
    preferred_time: input.preferredTime ?? null,
    report_pdf_path: input.reportPdfPath ?? null,
    status: "requested",
  };
  // Prefer storing the snapshots (0005/0006 migrations). When a migration hasn't been applied yet
  // its column doesn't exist — retry with fewer extras so booking never breaks.
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
    console.warn("[appointments] snapshot column missing, retrying with less:", error.message);
  }
  throw new Error(lastError || "Couldn't create the appointment.");
}

/**
 * Patient attaches the generated Skin Report PDF path to their own appointment row (RLS: patient
 * update own).
 */
export async function attachReportToAppointment(id: string, reportPath: string): Promise<void> {
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
 * Patient picks a new preferred time for a request whose slot was taken (needs_reschedule →
 * requested). The server re-checks that the time is in the future and free.
 */
export async function rescheduleRequest(id: string, preferredTime: string): Promise<void> {
  const at = Date.parse(preferredTime);
  if (!Number.isFinite(at) || at <= Date.now()) throw new Error(PAST_TIME_MESSAGE);
  const user = await requireUser();
  const { data, error } = await supabase
    .from("appointments")
    .update({ preferred_time: preferredTime, status: "requested" })
    .eq("id", id)
    .eq("patient_id", user.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Couldn't find that request — pull to refresh and try again.");
  }
}

/**
 * Times at a clinic in [from, to] that a new request can't use: confirmed visits and (0018) other
 * patients' pending requests — for that doctor, or with no free doctor left when `doctorId` is null.
 * Times only — never who booked them. `excludeId` skips the request being rescheduled. Falls back to
 * the 0015 (confirmed-only) RPC, and to [] before that.
 */
export async function getTakenSlots(
  clinicId: string,
  doctorId: string | null,
  from: Date,
  to: Date,
  excludeId: string | null = null,
): Promise<Date[]> {
  const args = {
    p_clinic_id: clinicId,
    p_doctor_id: doctorId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  };
  let { data, error } = await supabase.rpc("get_taken_slots", { ...args, p_exclude_id: excludeId });
  if (error && isMissingFunctionError(error)) {
    ({ data, error } = await supabase.rpc("get_taken_slots", args));
  }
  if (error) {
    if (isMissingFunctionError(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as string[])
    .map((iso) => new Date(iso))
    .filter((d) => !Number.isNaN(d.getTime()));
}

/** True when `at` overlaps any of `taken` (slots are SLOT_MINUTES long). */
export function overlapsTakenSlot(at: Date, taken: Date[]): boolean {
  return taken.some((t) => Math.abs(t.getTime() - at.getTime()) < SLOT_MS);
}

/** Doctor's queue: every appointment at THEIR clinic (RLS: doctor select own clinic). */
export async function getClinicAppointments(clinicId: string): Promise<AppointmentRow[]> {
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

/** Patient-side copy for a preferred time that overlaps a confirmed visit. */
export const BOOKED_SLOT_MESSAGE = "That time is already booked — please pick another date & time.";

/** Friendly copy for a picked slot that has already passed. */
export const PAST_TIME_MESSAGE = "That time has already passed — please pick a later date & time.";

/** Another patient's pending request already holds that time (0018 migration — same text). */
export const HELD_SLOT_MESSAGE =
  "Another patient already asked for that time — please pick another date & time.";

/** Patient already has a request waiting at this clinic (0018 migration — same text). */
export const PENDING_HERE_MESSAGE =
  "You already have a pending request at this clinic — wait for the doctor or cancel it first.";

/** Patient's picked time is within 30 minutes of another of their own visits (0018 migration). */
export const OWN_OVERLAP_MESSAGE =
  "You already have another visit or request around that time — pick a different date & time.";

/** A doctor tried to schedule a request addressed to a colleague (0018 migration). */
export const OTHER_DOCTOR_MESSAGE =
  "This request is for another doctor at your clinic — only they can schedule it.";

/**
 * True when a CONFIRMED visit already occupies this exact minute for the doctor being scheduled (an
 * unassigned scheduled row counts too, so the clinic never double-books a slot).
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
  return (data ?? []).some((row) => row.doctor_id === null || row.doctor_id === doctorId);
}

async function isActiveDoctor(clinicId: string, doctorId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("doctors")
    .select("user_id")
    .eq("clinic_id", clinicId)
    .eq("user_id", doctorId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

/** Doctor schedules / completes / declines (RLS: doctor update own clinic). */
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

  if (input.claimAsDoctor || (input.status === "scheduled" && input.scheduledAt)) {
    const { data: row, error: rowError } = await supabase
      .from("appointments")
      .select("clinic_id, doctor_id")
      .eq("id", id)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row) {
      throw new Error("Couldn't find that appointment — pull to refresh and try again.");
    }
    const { clinic_id: clinicId, doctor_id: assigned } = row as {
      clinic_id: string;
      doctor_id: string | null;
    };
    // Only claim a request that's unassigned, or whose doctor has left the clinic. A request the
    // patient addressed to a colleague stays theirs (the server enforces the same rule).
    if (input.claimAsDoctor && assigned !== user.id) {
      if (assigned && (await isActiveDoctor(clinicId, assigned))) {
        throw new Error(OTHER_DOCTOR_MESSAGE);
      }
      patch.doctor_id = user.id;
    }
    if (
      input.status === "scheduled" &&
      input.scheduledAt &&
      (await hasSlotConflict(id, clinicId, input.scheduledAt, user.id))
    ) {
      throw new Error(SLOT_TAKEN_MESSAGE);
    }
  }

  const { error } = await supabase.from("appointments").update(patch).eq("id", id);
  if (error) {
    // Lost a race against the unique slot index (migration 0007).
    if (isDuplicateKeyError(error)) throw new Error(SLOT_TAKEN_MESSAGE);
    throw new Error(error.message);
  }
}

/**
 * Display name for a patient row. Always carries the human identifier (first name / username) so
 * the doctor never sees a bare "Patient".
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
 * Preferred display name for one appointment in the doctor queue: live-resolved profile name first,
 * then the booking-time snapshot, then the "Patient" fallback.
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
  const doctorIds = [...new Set(rows.map((r) => r.doctor_id).filter((v): v is string => !!v))];
  const clinicIds = [...new Set(rows.map((r) => r.clinic_id))];
  // Booking-time snapshots first — the doctor queue can show these even
  // when user_profile rows aren't readable under RLS (newest row wins).
  for (const r of rows) {
    const snap = (r.patient_name ?? "").trim();
    if (snap && !patientNames[r.patient_id]) {
      patientNames[r.patient_id] = snap;
    }
    if (!patientAvatars[r.patient_id] && isRemoteImageUrl(r.patient_avatar_url)) {
      patientAvatars[r.patient_id] = (r.patient_avatar_url as string).trim();
    }
  }
  const unresolved = () =>
    patientIds.filter((id) => !patientNames[id] || patientNames[id] === "Patient");
  try {
    let ids = unresolved();
    if (ids.length > 0) {
      // 1. Doctor-safe lookup (0005 migration, SECURITY DEFINER): returns only
      // id/username/first_name for the caller's own clinic patients.
      try {
        const { data, error } = await supabase.rpc("get_patient_display_names", { p_ids: ids });
        if (error) throw error;
        applyPatientNameRows(patientNames, patientAvatars, data as PatientNameRow[]);
      } catch (rpcErr) {
        console.warn(
          "[appointments] patient-name RPC unavailable, trying direct read:",
          rpcErr instanceof Error ? rpcErr.message : rpcErr,
        );
        // 2. Direct read (works when RLS permits + columns exist). face_image_url may also be
        // missing server-side — retry without it on column errors.
        ids = unresolved();
        if (ids.length > 0) {
          try {
            const { data, error } = await supabase
              .from("user_profile")
              .select("id, username, first_name, face_image_url")
              .in("id", ids);
            if (error) throw error;
            applyPatientNameRows(patientNames, patientAvatars, data as PatientNameRow[]);
          } catch (directErr) {
            if (
              !isMissingColumnError({
                message: directErr instanceof Error ? directErr.message : String(directErr),
              })
            )
              throw directErr;
            const { data, error } = await supabase
              .from("user_profile")
              .select("id, username, first_name")
              .in("id", ids);
            if (error) throw error;
            applyPatientNameRows(patientNames, patientAvatars, data as PatientNameRow[]);
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
      const { data } = await supabase.from("clinics").select("id, name").in("id", clinicIds);
      for (const c of (data ?? []) as { id: string; name: string }[]) {
        clinicNames[c.id] = c.name;
      }
    }
  } catch {
    /* best-effort */
  }
  return { patientNames, patientAvatars, doctorNames, clinicNames };
}
