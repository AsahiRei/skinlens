-- 0018 · booking rules the 0015 guard missed
--
-- 1. A patient can't stack requests:
--    - only one pending request (requested / needs_reschedule) per clinic;
--    - no preferred time within 30 minutes of another of their own pending
--      requests or confirmed visits (any clinic).
-- 2. A request addressed to a specific (still active) doctor can only be
--    scheduled or reassigned by that doctor. Before this, any doctor at the
--    clinic who pressed "Schedule" silently claimed it and the slot was
--    checked against the wrong calendar.
-- 3. First come, first served: a pending request HOLDS its time. Before this
--    two patients could request the same slot and only found out when the
--    doctor confirmed one (the other was bumped to needs_reschedule).
--    - Addressed to a doctor → that doctor is held at that time.
--    - "First available" → uses up one free doctor at that time; the slot is
--      full once every active doctor is busy or held (a clinic with no
--      doctors listed yet takes one request per slot).
--    get_taken_slots now returns held times too, so the picker greys them out.
--
-- Safe to re-run (create or replace / drop if exists).
--
-- Runs alongside appointments_guard_write (0015); both are BEFORE triggers.
-- The app mirrors these rules in utils/booking-slots.ts (findOwnConflict) and
-- lib/db/appointments.ts (updateAppointment) for friendlier messages.

-- ── 3. slot holds ─────────────────────────────────────────────────────────

-- Is this doctor busy (confirmed visit) or held (pending request for them)?
create or replace function public.appointment_doctor_held(
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
  select public.appointment_doctor_busy(p_clinic_id, p_doctor_id, p_at, p_exclude_id)
    or exists (
      select 1
      from public.appointments a
      where a.clinic_id = p_clinic_id
        and a.status = 'requested'
        and a.doctor_id = p_doctor_id
        and a.preferred_time is not null
        and (p_exclude_id is null or a.id <> p_exclude_id)
        and a.preferred_time > p_at - public.appointment_slot_length()
        and a.preferred_time < p_at + public.appointment_slot_length()
    );
$$;

-- Can a NEW request (for p_doctor_id, or "first available" when null) still
-- take this time, counting confirmed visits AND other patients' pending
-- requests? True = no room.
create or replace function public.appointment_slot_held(
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
declare
  v_doctors int;
  v_free int;
  v_unassigned int;
begin
  if p_at is null then
    return false;
  end if;

  -- Pending "first available" requests around this time — each needs a doctor.
  select count(*) into v_unassigned
  from public.appointments a
  where a.clinic_id = p_clinic_id
    and a.status = 'requested'
    and a.doctor_id is null
    and a.preferred_time is not null
    and (p_exclude_id is null or a.id <> p_exclude_id)
    and a.preferred_time > p_at - public.appointment_slot_length()
    and a.preferred_time < p_at + public.appointment_slot_length();

  select count(*) into v_doctors
  from public.doctors d
  where d.clinic_id = p_clinic_id and d.is_active = true;

  if v_doctors = 0 then
    -- No doctors listed yet: one visit per slot.
    return v_unassigned > 0 or exists (
      select 1 from public.appointments a
      where a.clinic_id = p_clinic_id
        and (p_exclude_id is null or a.id <> p_exclude_id)
        and (
          (a.status = 'scheduled'
            and a.scheduled_at > p_at - public.appointment_slot_length()
            and a.scheduled_at < p_at + public.appointment_slot_length())
          or (a.status = 'requested'
            and a.preferred_time > p_at - public.appointment_slot_length()
            and a.preferred_time < p_at + public.appointment_slot_length())
        )
    );
  end if;

  if p_doctor_id is not null then
    if public.appointment_doctor_held(p_clinic_id, p_doctor_id, p_at, p_exclude_id) then
      return true;
    end if;
    -- Taking this doctor must still leave a doctor for every pending
    -- "first available" request at this time.
    select count(*) into v_free
    from public.doctors d
    where d.clinic_id = p_clinic_id
      and d.is_active = true
      and d.user_id <> p_doctor_id
      and not public.appointment_doctor_held(p_clinic_id, d.user_id, p_at, p_exclude_id);
    return v_unassigned > v_free;
  end if;

  select count(*) into v_free
  from public.doctors d
  where d.clinic_id = p_clinic_id
    and d.is_active = true
    and not public.appointment_doctor_held(p_clinic_id, d.user_id, p_at, p_exclude_id);
  return v_unassigned >= v_free;
end $$;

revoke execute on function public.appointment_doctor_held(uuid, uuid, timestamptz, uuid) from public, anon;
revoke execute on function public.appointment_slot_held(uuid, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.appointment_doctor_held(uuid, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.appointment_slot_held(uuid, uuid, timestamptz, uuid) to authenticated;

-- Patient-facing: times in [from, to] a new request can't use — confirmed
-- visits and other patients' pending requests. Times only, never who.
-- p_exclude_id skips the caller's own request while they reschedule it.
drop function if exists public.get_taken_slots(uuid, uuid, timestamptz, timestamptz);
create or replace function public.get_taken_slots(
  p_clinic_id uuid,
  p_doctor_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_exclude_id uuid default null
)
returns setof timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select distinct t.at
  from (
    select a.scheduled_at as at
    from public.appointments a
    where a.clinic_id = p_clinic_id and a.status = 'scheduled'
    union
    select a.preferred_time
    from public.appointments a
    where a.clinic_id = p_clinic_id and a.status = 'requested'
      and (p_exclude_id is null or a.id <> p_exclude_id)
  ) t
  where auth.uid() is not null
    and t.at is not null
    and t.at >= p_from - public.appointment_slot_length()
    and t.at <= p_to + public.appointment_slot_length()
    and p_to - p_from <= interval '62 days'
    and public.appointment_slot_held(p_clinic_id, p_doctor_id, t.at, p_exclude_id)
  order by 1;
$$;

revoke execute on function public.get_taken_slots(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.get_taken_slots(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;

-- ── guard ─────────────────────────────────────────────────────────────────

create or replace function public.guard_appointment_booking_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new_time boolean;
  v_assigned_active boolean;
begin
  -- SECURITY DEFINER helpers (bump_conflicting_requests, delete_my_account)
  -- and the service role skip the checks, like the 0015 guard.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- ── 1. patient: one pending request per clinic, no overlapping times ──
  if new.patient_id = v_uid then
    -- Serialize per patient so two quick taps can't both pass.
    perform pg_advisory_xact_lock(hashtextextended('appt-patient:' || v_uid::text, 0));

    if tg_op = 'INSERT' and exists (
      select 1 from public.appointments a
      where a.patient_id = v_uid
        and a.clinic_id = new.clinic_id
        and a.status in ('requested', 'needs_reschedule')
    ) then
      raise exception 'You already have a pending request at this clinic — wait for the doctor or cancel it first.';
    end if;

    -- This trigger fires before the 0015 guard (name order), which forces
    -- inserts to 'requested' — so every patient insert counts as pending.
    v_new_time := new.preferred_time is not null
      and (tg_op = 'INSERT'
           or (new.status in ('requested', 'needs_reschedule')
               and new.preferred_time is distinct from old.preferred_time));

    if v_new_time and exists (
      select 1 from public.appointments a
      where a.patient_id = v_uid
        and a.id <> new.id
        and (
          (a.status = 'scheduled'
            and a.scheduled_at > new.preferred_time - public.appointment_slot_length()
            and a.scheduled_at < new.preferred_time + public.appointment_slot_length())
          or (a.status in ('requested', 'needs_reschedule')
            and a.preferred_time > new.preferred_time - public.appointment_slot_length()
            and a.preferred_time < new.preferred_time + public.appointment_slot_length())
        )
    ) then
      raise exception 'You already have another visit or request around that time — pick a different date & time.';
    end if;

    -- 3. First come, first served. Take the same per-clinic lock as the 0015
    -- guard (this trigger fires first) so two patients tapping "Request" at
    -- the same moment can't both get the slot.
    if v_new_time then
      perform pg_advisory_xact_lock(hashtextextended('appt-slot:' || new.clinic_id::text, 0));
      if public.appointment_slot_held(
           new.clinic_id, new.doctor_id, new.preferred_time,
           case when tg_op = 'UPDATE' then new.id else null end) then
        raise exception 'Another patient already asked for that time — please pick another date & time.';
      end if;
    end if;
  end if;

  -- ── 2. doctor: hands off another doctor's request ──
  if tg_op = 'UPDATE'
     and old.patient_id is distinct from v_uid
     and old.doctor_id is not null
     and old.doctor_id <> v_uid
     and (
       new.doctor_id is distinct from old.doctor_id
       or (old.status in ('requested', 'needs_reschedule') and new.status = 'scheduled')
     ) then
    -- A request for a doctor who has since left the clinic can be picked up.
    v_assigned_active := exists (
      select 1 from public.doctors d
      where d.user_id = old.doctor_id
        and d.clinic_id = old.clinic_id
        and d.is_active = true
    );
    if v_assigned_active then
      raise exception 'This request is for another doctor at your clinic — only they can schedule it.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists appointments_guard_booking_rules on public.appointments;
create trigger appointments_guard_booking_rules
  before insert or update on public.appointments
  for each row execute function public.guard_appointment_booking_rules();
