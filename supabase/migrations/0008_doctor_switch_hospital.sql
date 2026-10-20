-- 0008_doctor_switch_hospital.sql
-- Lets a doctor MOVE an existing account to a different hospital with a new
-- invite code (the app's "Switch hospital" flow). Previously
-- redeem_clinic_code() refused any already-registered doctor with
-- 'This account is already registered as a doctor.' — switching was
-- impossible.
--
-- On a switch it also deletes every appointment at the departing hospital so
-- nothing lingers in the old clinic once the doctor has moved on.
-- Empty display name / specialty keep the existing values, so the app can
-- switch without re-asking for a name.
--
-- APPLY (required for existing databases — editing 0002 alone does nothing
-- once it has been applied):
--   1. supabase db push, or
--   2. Supabase Dashboard → SQL Editor → paste this file → Run
--
-- 0002_clinic_booking.sql carries the same function definition for fresh
-- databases, so this file and 0002 stay in sync.

create or replace function public.redeem_clinic_code(
  p_code text,
  p_display_name text,
  p_specialty text default 'Dermatology'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.clinic_invite_codes%rowtype;
  v_clinic public.clinics%rowtype;
  v_old_clinic uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  select * into v_code
  from public.clinic_invite_codes
  where upper(trim(code)) = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Invalid invite code.';
  end if;
  if not v_code.is_active then
    raise exception 'This invite code was revoked.';
  end if;
  if v_code.expires_at <= now() then
    raise exception 'This invite code expired.';
  end if;
  if v_code.used_count >= v_code.max_uses then
    raise exception 'This invite code was already used up.';
  end if;

  select * into v_clinic from public.clinics where id = v_code.clinic_id;
  if not found or not v_clinic.is_active then
    raise exception 'This hospital is not active.';
  end if;

  -- Switching hospitals is allowed: an account that already has a doctors
  -- row is repointed to the new clinic instead of refused. The row is locked
  -- first so a concurrent redeem can't race. An empty name/specialty keeps
  -- the existing value so the UI can switch without re-entering them.
  select clinic_id into v_old_clinic
  from public.doctors
  where user_id = auth.uid()
  for update;

  if v_old_clinic is not null and v_old_clinic <> v_code.clinic_id then
    -- Switching hospitals: wipe the departing hospital's appointments so
    -- nothing lingers once this doctor has moved to the new one.
    delete from public.appointments
    where clinic_id = v_old_clinic;
  end if;

  if v_old_clinic is null then
    insert into public.doctors (user_id, clinic_id, display_name, specialty)
    values (auth.uid(), v_code.clinic_id, trim(p_display_name), trim(p_specialty));
  else
    update public.doctors
    set clinic_id = v_code.clinic_id,
        display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
        specialty = coalesce(nullif(trim(p_specialty), ''), specialty)
    where user_id = auth.uid();
  end if;

  update public.user_profile set role = 'doctor' where id = auth.uid();

  update public.clinic_invite_codes
  set used_count = used_count + 1
  where id = v_code.id;

  return jsonb_build_object(
    'clinic_id', v_clinic.id,
    'clinic_name', v_clinic.name
  );
end $$;

notify pgrst, 'reload schema';
