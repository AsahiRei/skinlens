-- 0007_result_validation.sql
-- Three things the app needs server-side:
--   1. The scan fields that used to be device-only (confidence /
--      detection_label / survey_answers) so progress history survives a
--      lost / reset phone.
--   2. Dermatologist validation of AI results: status + notes written by a
--      doctor, read back by the patient. Accessed only through the two
--      SECURITY DEFINER RPCs below (works whatever the `results` RLS state
--      is), both of which verify the caller is an active doctor WITH an
--      active appointment for that patient.
--   3. A scheduling guard so one doctor can never hold two confirmed
--      visits at the same minute.
--
-- HOW TO APPLY (pick one):
--   1. Supabase Dashboard -> SQL Editor -> paste this file -> Run, or
--   2. supabase db push   (from the C:\skinlens folder, if linked)
--
-- Every statement is idempotent (safe to re-run).

-- ── 1. scan fields now persist server-side ────────────────────────────────
alter table public.results add column if not exists confidence real;
alter table public.results add column if not exists detection_label text;
alter table public.results add column if not exists survey_answers text;

-- ── 2. dermatologist validation columns ───────────────────────────────────
alter table public.results
  add column if not exists validation_status text not null default 'pending';

alter table public.results drop constraint if exists results_validation_status_check;
alter table public.results
  add constraint results_validation_status_check
  check (validation_status in ('pending', 'confirmed', 'needs_review'));

alter table public.results add column if not exists doctor_notes text;
alter table public.results
  add column if not exists validated_by uuid references auth.users (id) on delete set null;
alter table public.results add column if not exists validated_at timestamptz;

-- ── get_patient_latest_result: doctor reads one patient's newest AI result ─
-- Returns jsonb (or null when the patient has never scanned) and contains
-- only what the review UI needs — no images, no survey answers.
create or replace function public.get_patient_latest_result(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  if not exists (
    select 1 from public.doctors d
    where d.user_id = auth.uid()
      and d.is_active = true
  ) then
    raise exception 'Only linked dermatologist accounts can read patient results.';
  end if;

  if not exists (
    select 1
    from public.appointments a
    join public.doctors d
      on d.user_id = auth.uid()
     and d.is_active = true
     and d.clinic_id = a.clinic_id
    where a.patient_id = p_patient_id
      and a.status not in ('cancelled', 'declined')
  ) then
    raise exception 'No active appointment links this patient to your clinic.';
  end if;

  select jsonb_build_object(
    'id', r.id,
    'severity', r.severity,
    'healthscore', r.healthscore,
    'confidence', r.confidence,
    'detection_label', r.detection_label,
    'validation_status', r.validation_status,
    'doctor_notes', r.doctor_notes,
    'validated_at', r.validated_at,
    'created_at', r.created_at
  )
  into v_row
  from public.results r
  where r.user_id = p_patient_id
  order by r.created_at desc nulls last
  limit 1;

  return v_row;  -- jsonb null when no row matched
end $$;

-- ── validate_ai_result: doctor confirms / flags one AI result ─────────────
-- Only the validation columns are written — a doctor can never alter the
-- scores, the detection, or any other patient-owned data through this.
create or replace function public.validate_ai_result(
  p_result_id bigint,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.results%rowtype;
  v_clinic uuid;
  v_notes text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if p_status is null or p_status not in ('confirmed', 'needs_review') then
    raise exception 'Status must be confirmed or needs_review.';
  end if;
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  select clinic_id into v_clinic
  from public.doctors
  where user_id = auth.uid()
    and is_active = true;
  if not found then
    raise exception 'Only linked dermatologist accounts can validate results.';
  end if;

  select * into v_result
  from public.results
  where id = p_result_id;
  if not found then
    raise exception 'Result not found.';
  end if;

  if not exists (
    select 1
    from public.appointments a
    where a.clinic_id = v_clinic
      and a.patient_id = v_result.user_id
      and a.status not in ('cancelled', 'declined')
  ) then
    raise exception 'No active appointment links this patient to your clinic.';
  end if;

  update public.results
  set validation_status = p_status,
      doctor_notes = v_notes,
      validated_by = auth.uid(),
      validated_at = now()
  where id = p_result_id;

  return jsonb_build_object(
    'id', v_result.id,
    'validation_status', p_status,
    'doctor_notes', v_notes,
    'validated_at', now()
  );
end $$;

-- Only signed-in app users may call these (the in-app checks above do the
-- real authorization; this just keeps anon out).
revoke execute on function public.get_patient_latest_result(uuid) from public, anon;
revoke execute on function public.validate_ai_result(bigint, text, text) from public, anon;
grant execute on function public.get_patient_latest_result(uuid) to authenticated;
grant execute on function public.validate_ai_result(bigint, text, text) to authenticated;

-- ── 3. no double-booked doctor slots ──────────────────────────────────────
-- Partial unique index: one CONFIRMED (status='scheduled') visit per doctor
-- per minute. Applied best-effort — if legacy data already contains
-- duplicates the index is skipped (notice) instead of failing the whole
-- migration; the app also checks for conflicts before scheduling.
do $$
begin
  if exists (
    select 1
    from public.appointments
    where status = 'scheduled'
      and doctor_id is not null
      and scheduled_at is not null
    group by doctor_id, scheduled_at
    having count(*) > 1
  ) then
    raise notice 'appointments: duplicate scheduled slots already exist — skipping unique index (resolve them, then re-run this file)';
  else
    execute $idx$
      create unique index if not exists appointments_doctor_slot_uidx
        on public.appointments (doctor_id, scheduled_at)
        where status = 'scheduled'
          and doctor_id is not null
          and scheduled_at is not null
    $idx$;
  end if;
exception when others then
  raise notice 'appointments: could not create the slot index (%)', sqlerrm;
end $$;

notify pgrst, 'reload schema';
