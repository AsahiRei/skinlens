-- 0015 · Appointment rules (panel feedback)
--
--   1. Schedule validation — a visit must be in the future, and a doctor can't
--      hold two visits whose 30-minute slots overlap (the 0007 unique index only
--      caught the exact same minute).
--   2. Slot conflicts — when the doctor confirms a visit, every pending request
--      that wanted the now-taken slot moves to 'needs_reschedule' so the patient
--      is told to pick another time. Patients also can't request a taken slot.
--   3. Mark as done — only a scheduled visit whose time has arrived (server
--      clock) can be completed.
--   4. Status transitions — completed / cancelled / declined are final.
--
-- Error messages raised with errcode P0001 are shown to users verbatim.

-- ── status: add needs_reschedule ───────────────────────────────────────────
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('requested', 'needs_reschedule', 'scheduled', 'completed', 'cancelled', 'declined'));

-- ── slot length ────────────────────────────────────────────────────────────
create or replace function public.appointment_slot_length()
returns interval
language sql
immutable
as $$ select interval '30 minutes' $$;

-- ── is this doctor already busy at this time? ──────────────────────────────
-- A confirmed visit with NO doctor attached also blocks the slot clinic-wide
-- (same behaviour as the old app-side check).
create or replace function public.appointment_doctor_busy(
  p_clinic_id uuid,
  p_doctor_id uuid,
  p_at timestamptz,
  p_exclude_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.appointments a
    where a.clinic_id = p_clinic_id
      and a.status = 'scheduled'
      and a.scheduled_at is not null
      and (p_exclude_id is null or a.id <> p_exclude_id)
      and (a.doctor_id = p_doctor_id or a.doctor_id is null)
      and a.scheduled_at > p_at - public.appointment_slot_length()
      and a.scheduled_at < p_at + public.appointment_slot_length()
  );
$$;

-- ── is this slot taken for a request? ──────────────────────────────────────
-- Addressed to a doctor → that doctor is busy.
-- Unassigned ("any doctor") → every active doctor at the clinic is busy. A
-- clinic with no active doctors is never "taken" (nobody to compare against).
create or replace function public.appointment_slot_taken(
  p_clinic_id uuid,
  p_doctor_id uuid,
  p_at timestamptz,
  p_exclude_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_at is null then
    return false;
  end if;
  if p_doctor_id is not null then
    return public.appointment_doctor_busy(p_clinic_id, p_doctor_id, p_at, p_exclude_id);
  end if;
  return exists (
      select 1 from public.doctors d
      where d.clinic_id = p_clinic_id and d.is_active = true
    )
    and not exists (
      select 1 from public.doctors d
      where d.clinic_id = p_clinic_id
        and d.is_active = true
        and not public.appointment_doctor_busy(p_clinic_id, d.user_id, p_at, p_exclude_id)
    );
end $$;

revoke execute on function public.appointment_doctor_busy(uuid, uuid, timestamptz, uuid) from public, anon;
revoke execute on function public.appointment_slot_taken(uuid, uuid, timestamptz, uuid) from public, anon;
-- The guard trigger runs as the caller, so signed-in users need EXECUTE.
grant execute on function public.appointment_doctor_busy(uuid, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.appointment_slot_taken(uuid, uuid, timestamptz, uuid) to authenticated;

-- ── patient-facing: which confirmed times are taken in a window? ───────────
-- Returns only times — never who booked them.
create or replace function public.get_taken_slots(
  p_clinic_id uuid,
  p_doctor_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns setof timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select distinct a.scheduled_at
  from public.appointments a
  where auth.uid() is not null
    and a.clinic_id = p_clinic_id
    and a.status = 'scheduled'
    and a.scheduled_at is not null
    and a.scheduled_at >= p_from - public.appointment_slot_length()
    and a.scheduled_at <= p_to + public.appointment_slot_length()
    and p_to - p_from <= interval '62 days'
    and public.appointment_slot_taken(p_clinic_id, p_doctor_id, a.scheduled_at, null)
  order by 1;
$$;

revoke execute on function public.get_taken_slots(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_taken_slots(uuid, uuid, timestamptz, timestamptz) to authenticated;

-- ── column + transition guard (replaces the 0010 version) ──────────────────
-- SECURITY INVOKER on purpose: SECURITY DEFINER functions (redeem,
-- delete_my_account, the conflict bump below) and the service role bypass it.
create or replace function public.guard_appointment_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_doctor boolean;
  v_doctor_ok boolean;
  v_patient_ok boolean;
  v_new_slot boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Serialize slot decisions per clinic so two concurrent writes can't both
  -- see the slot as free.
  perform pg_advisory_xact_lock(hashtextextended('appt-slot:' || new.clinic_id::text, 0));

  if tg_op = 'INSERT' then
    -- Patients can only REQUEST a visit; doctors set the schedule.
    if new.patient_id = v_uid then
      new.status := 'requested';
      new.scheduled_at := null;
      if new.report_pdf_path is not null
         and split_part(regexp_replace(new.report_pdf_path, '^/*(reports/)?', ''), '/', 1) <> v_uid::text then
        raise exception 'Reports must come from your own folder.' using errcode = '42501';
      end if;
      if new.preferred_time is not null then
        if new.preferred_time <= now() then
          raise exception 'That time has already passed — please pick a later date & time.';
        end if;
        if public.appointment_slot_taken(new.clinic_id, new.doctor_id, new.preferred_time, null) then
          raise exception 'That time is already booked — please pick another date & time.';
        end if;
      end if;
    end if;
    return new;
  end if;

  -- ── UPDATE ──
  if old.status in ('completed', 'cancelled', 'declined')
     and new.status is distinct from old.status then
    raise exception 'This appointment is already closed and can''t be changed.';
  end if;

  v_is_doctor := exists (
    select 1 from public.doctors d
    where d.user_id = v_uid
      and d.is_active = true
      and d.clinic_id = old.clinic_id
  );

  -- Doctor: may change status / scheduled_at, and claim (or release) the visit.
  v_doctor_ok := v_is_doctor
    and new.patient_id is not distinct from old.patient_id
    and new.clinic_id is not distinct from old.clinic_id
    and new.report_pdf_path is not distinct from old.report_pdf_path
    and new.preferred_time is not distinct from old.preferred_time
    and new.created_at is not distinct from old.created_at
    and (new.doctor_id is not distinct from old.doctor_id
         or new.doctor_id is null
         or new.doctor_id = v_uid)
    and (
      new.status = old.status
      or (old.status in ('requested', 'needs_reschedule') and new.status in ('scheduled', 'declined'))
      or (old.status = 'scheduled' and new.status in ('completed', 'cancelled'))
    );

  -- Patient: may cancel, attach a report from their own folder, and pick a new
  -- preferred time while the request is still pending.
  v_patient_ok := old.patient_id = v_uid
    and new.patient_id is not distinct from old.patient_id
    and new.clinic_id is not distinct from old.clinic_id
    and new.doctor_id is not distinct from old.doctor_id
    and new.scheduled_at is not distinct from old.scheduled_at
    and new.created_at is not distinct from old.created_at
    and (new.preferred_time is not distinct from old.preferred_time
         or old.status in ('requested', 'needs_reschedule'))
    and (
      new.status = old.status
      or new.status = 'cancelled'
      or (old.status = 'needs_reschedule' and new.status = 'requested'
          and new.preferred_time is distinct from old.preferred_time)
    )
    and (new.report_pdf_path is not distinct from old.report_pdf_path
         or new.report_pdf_path is null
         or split_part(regexp_replace(new.report_pdf_path, '^/*(reports/)?', ''), '/', 1) = v_uid::text);

  if not (v_doctor_ok or v_patient_ok) then
    raise exception 'You are not allowed to make that change to this appointment.'
      using errcode = '42501';
  end if;

  -- Schedule validation: confirming or moving a visit.
  v_new_slot := new.status = 'scheduled'
    and (old.status <> 'scheduled' or new.scheduled_at is distinct from old.scheduled_at);
  if v_new_slot then
    if new.scheduled_at is null then
      raise exception 'Pick a date & time for this visit.';
    end if;
    if new.scheduled_at <= now() then
      raise exception 'That time has already passed — please pick a later date & time.';
    end if;
    if public.appointment_doctor_busy(new.clinic_id, coalesce(new.doctor_id, v_uid), new.scheduled_at, new.id) then
      raise exception 'You already have a visit within 30 minutes of that time — pick a different date & time.';
    end if;
  end if;

  -- Mark as done: only once the visit time has arrived.
  if new.status = 'completed' and old.status <> 'completed' then
    if old.scheduled_at is null or now() < old.scheduled_at then
      raise exception 'This visit can only be marked done from %.',
        to_char(old.scheduled_at at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM');
    end if;
    if new.scheduled_at is distinct from old.scheduled_at then
      raise exception 'You can''t change the visit time while completing it.';
    end if;
  end if;

  -- Patient picked a new time.
  if new.preferred_time is distinct from old.preferred_time and new.preferred_time is not null then
    if new.preferred_time <= now() then
      raise exception 'That time has already passed — please pick a later date & time.';
    end if;
    if public.appointment_slot_taken(new.clinic_id, new.doctor_id, new.preferred_time, new.id) then
      raise exception 'That time is already booked — please pick another date & time.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists appointments_guard_write on public.appointments;
create trigger appointments_guard_write
  before insert or update on public.appointments
  for each row execute function public.guard_appointment_write();

-- ── bump pending requests whose slot was just taken ────────────────────────
create or replace function public.bump_conflicting_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.appointments b
  set status = 'needs_reschedule'
  where b.clinic_id = new.clinic_id
    and b.id <> new.id
    and b.status = 'requested'
    and b.preferred_time is not null
    and b.preferred_time > new.scheduled_at - public.appointment_slot_length()
    and b.preferred_time < new.scheduled_at + public.appointment_slot_length()
    and (
      (b.doctor_id is not null and b.doctor_id is not distinct from new.doctor_id)
      or (b.doctor_id is null
          and public.appointment_slot_taken(b.clinic_id, null, b.preferred_time, b.id))
    );
  return null;
end $$;

revoke execute on function public.bump_conflicting_requests() from public, anon, authenticated;

drop trigger if exists appointments_bump_conflicts on public.appointments;
create trigger appointments_bump_conflicts
  after insert or update of status, scheduled_at, doctor_id on public.appointments
  for each row
  when (new.status = 'scheduled' and new.scheduled_at is not null)
  execute function public.bump_conflicting_requests();

notify pgrst, 'reload schema';
