-- 0012_profile_validation.sql
-- Dermatologist validation of a patient's PROFILE DATA (age, gender, skin
-- type, main concern, lifestyle answers, skin sensitivity history) — the
-- counterpart of 0007's AI-result validation.
--
--   * One row per patient in public.profile_validations holding the latest
--     verdict, the doctor's notes and a snapshot of exactly what was reviewed.
--   * The verdict counts as "current" only while the live profile still
--     matches that snapshot; once the patient edits anything (or logs a new
--     sensitivity reaction) the app shows "updated since review".
--   * All access goes through SECURITY DEFINER RPCs. Doctors must be active
--     AND have an active appointment with the patient at their clinic (same
--     rule as 0007). Doctors can never write to the patient's profile tables.
--
-- HOW TO APPLY (pick one):
--   1. Supabase Dashboard -> SQL Editor -> paste this file -> Run, or
--   2. supabase db push   (from the C:\skinlens folder, if linked)
--
-- Every statement is idempotent (safe to re-run).

-- ── table ─────────────────────────────────────────────────────────────────
create table if not exists public.profile_validations (
  patient_id       uuid primary key references auth.users (id) on delete cascade,
  status           text not null,
  doctor_notes     text,
  validated_by     uuid references auth.users (id) on delete set null,
  validator_name   text,
  validated_at     timestamptz not null default now(),
  profile_snapshot jsonb not null default '{}'::jsonb,
  constraint profile_validations_status_check
    check (status in ('confirmed', 'needs_review'))
);

-- RLS on with NO policies: clients only reach this table through the RPCs.
alter table public.profile_validations enable row level security;

-- ── snapshot of the reviewable profile data (internal helper) ─────────────
-- `id::text = p_uid::text` because the dashboard-created profile tables may
-- key on text or uuid (see 0010 §5).
create or replace function public.profile_review_snapshot(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'first_name',    (select up.first_name from public.user_profile up where up.id::text = p_uid::text),
    'age',           (select up.age        from public.user_profile up where up.id::text = p_uid::text),
    'gender',        (select up.gender     from public.user_profile up where up.id::text = p_uid::text),
    'skin_type',     (select sp.skin_type     from public.skin_profile sp where sp.id::text = p_uid::text),
    'main_concerns', (select sp.main_concerns from public.skin_profile sp where sp.id::text = p_uid::text),
    'sleep_quality', (select lp.sleep_quality from public.lifestyle_profile lp where lp.id::text = p_uid::text),
    'water_intake',  (select lp.water_intake  from public.lifestyle_profile lp where lp.id::text = p_uid::text),
    'stress_level',  (select lp.stress_level  from public.lifestyle_profile lp where lp.id::text = p_uid::text),
    'sensitivity', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sh.id,
          'trigger_cause', sh.trigger_cause,
          'severity', sh.severity,
          'notes', sh.notes,
          'occurred_at', sh.occurred_at
        )
        order by sh.occurred_at desc, sh.id desc
      )
      from public.sensitivity_history sh
      where sh.user_id = p_uid
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.profile_review_snapshot(uuid) from public, anon, authenticated;

-- ── doctor → patient link check (internal helper) ─────────────────────────
-- Raises unless the caller is an active doctor whose clinic holds a
-- non-cancelled / non-declined appointment with this patient.
create or replace function public.assert_doctor_can_review(p_patient_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  if not exists (
    select 1 from public.doctors d
    where d.user_id = auth.uid()
      and d.is_active = true
  ) then
    raise exception 'Only linked dermatologist accounts can review patient profiles.';
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
end $$;

revoke execute on function public.assert_doctor_can_review(uuid) from public, anon, authenticated;

-- ── get_patient_profile_for_review: doctor reads the profile + verdict ────
create or replace function public.get_patient_profile_for_review(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_row public.profile_validations%rowtype;
begin
  perform public.assert_doctor_can_review(p_patient_id);

  v_snapshot := public.profile_review_snapshot(p_patient_id);

  select * into v_row
  from public.profile_validations
  where patient_id = p_patient_id;

  return jsonb_build_object(
    'profile', v_snapshot,
    'validation', case when v_row.patient_id is null then null else
      jsonb_build_object(
        'status', v_row.status,
        'doctor_notes', v_row.doctor_notes,
        'validator_name', v_row.validator_name,
        'validated_at', v_row.validated_at,
        'is_current', v_row.profile_snapshot = v_snapshot
      )
    end
  );
end $$;

-- ── validate_patient_profile: doctor confirms / flags the profile ─────────
-- Stores the snapshot the doctor just reviewed so later edits by the patient
-- are detectable. Never touches the patient's own profile tables.
create or replace function public.validate_patient_profile(
  p_patient_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notes text;
  v_name text;
  v_snapshot jsonb;
begin
  if p_status is null or p_status not in ('confirmed', 'needs_review') then
    raise exception 'Status must be confirmed or needs_review.';
  end if;
  perform public.assert_doctor_can_review(p_patient_id);

  v_notes := nullif(trim(coalesce(p_notes, '')), '');
  if v_notes is not null and length(v_notes) > 1000 then
    raise exception 'Notes are too long (1000 characters max).';
  end if;

  select d.display_name into v_name
  from public.doctors d
  where d.user_id = auth.uid();

  v_snapshot := public.profile_review_snapshot(p_patient_id);

  insert into public.profile_validations as pv (
    patient_id, status, doctor_notes, validated_by, validator_name,
    validated_at, profile_snapshot
  )
  values (
    p_patient_id, p_status, v_notes, auth.uid(), v_name, now(), v_snapshot
  )
  on conflict (patient_id) do update
    set status = excluded.status,
        doctor_notes = excluded.doctor_notes,
        validated_by = excluded.validated_by,
        validator_name = excluded.validator_name,
        validated_at = excluded.validated_at,
        profile_snapshot = excluded.profile_snapshot;

  return jsonb_build_object(
    'status', p_status,
    'doctor_notes', v_notes,
    'validator_name', v_name,
    'validated_at', now(),
    'is_current', true
  );
end $$;

-- ── get_my_profile_validation: patient reads their own verdict ────────────
create or replace function public.get_my_profile_validation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profile_validations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  select * into v_row
  from public.profile_validations
  where patient_id = auth.uid();

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'status', v_row.status,
    'doctor_notes', v_row.doctor_notes,
    'validator_name', v_row.validator_name,
    'validated_at', v_row.validated_at,
    'is_current', v_row.profile_snapshot = public.profile_review_snapshot(auth.uid())
  );
end $$;

revoke execute on function public.get_patient_profile_for_review(uuid) from public, anon;
revoke execute on function public.validate_patient_profile(uuid, text, text) from public, anon;
revoke execute on function public.get_my_profile_validation() from public, anon;
grant execute on function public.get_patient_profile_for_review(uuid) to authenticated;
grant execute on function public.validate_patient_profile(uuid, text, text) to authenticated;
grant execute on function public.get_my_profile_validation() to authenticated;

notify pgrst, 'reload schema';
