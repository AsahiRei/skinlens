-- 0010_security_hardening.sql
-- Pre-deployment security pass. Fixes, in order of severity:
--
--   1. redeem_clinic_code() deleted EVERY appointment at a doctor's old
--      clinic when they switched hospitals — wiping other doctors' queues
--      and patients' visit history. Now only this doctor's OPEN visits are
--      released back to the clinic queue; nothing is deleted.
--   2. reports bucket: any signed-in user could read any patient's Skin
--      Report PDF (health data). Reads are now limited to the owning patient
--      and active doctors of the clinic the report was sent to.
--   3. appointments: the UPDATE policies allowed a patient to set any
--      column (e.g. status='scheduled', another clinic_id, a doctor_id), and
--      a doctor to rewrite patient_id / report path. A guard trigger now
--      restricts each side to the columns its workflow actually needs.
--   4. user_profile.role: clients can no longer change their own role
--      (only redeem_clinic_code / the service role can).
--   5. Baseline owner-only RLS for core tables that were created in the
--      dashboard and never captured in a migration.
--   6. delete_my_account(): in-app account deletion (Google Play policy and
--      the app's own Privacy Policy promise this).
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run, or
-- `supabase db push`. Idempotent — safe to re-run.
--
-- AFTER APPLYING, audit existing policies (a permissive `using (true)` policy
-- created in the dashboard would still OR-in and leak rows):
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname in ('public','storage') order by 1, 2;

-- ── 1. non-destructive hospital switch ────────────────────────────────────
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

  select clinic_id into v_old_clinic
  from public.doctors
  where user_id = auth.uid()
  for update;

  if v_old_clinic is not null and v_old_clinic <> v_code.clinic_id then
    -- Release this doctor's still-open visits back to the old clinic's
    -- queue so another doctor there can pick them up. Completed /
    -- cancelled / declined history and other doctors' rows are untouched.
    update public.appointments
    set doctor_id = null,
        scheduled_at = null,
        status = 'requested'
    where clinic_id = v_old_clinic
      and doctor_id = auth.uid()
      and status in ('requested', 'scheduled');
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

revoke execute on function public.redeem_clinic_code(text, text, text) from public, anon;
grant execute on function public.redeem_clinic_code(text, text, text) to authenticated;

-- ── 2. reports bucket: owner + treating clinic only ───────────────────────
drop policy if exists "reports: authenticated read" on storage.objects;
drop policy if exists "reports: owner or clinic doctor read" on storage.objects;
create policy "reports: owner or clinic doctor read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reports'
    and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.appointments a
        join public.doctors d
          on d.clinic_id = a.clinic_id
         and d.user_id = auth.uid()
         and d.is_active = true
        where a.report_pdf_path is not null
          and regexp_replace(a.report_pdf_path, '^/*(reports/)?', '') = objects.name
      )
    )
  );

-- ── 3. appointments column guard ──────────────────────────────────────────
-- SECURITY INVOKER on purpose: inside SECURITY DEFINER functions (redeem,
-- delete_my_account) current_user is the owner, so they bypass the guard,
-- as does the service role used by the admin console.
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
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Patients can only REQUEST a visit; doctors set the schedule.
    if new.patient_id = v_uid then
      new.status := 'requested';
      new.scheduled_at := null;
      if new.report_pdf_path is not null
         and split_part(regexp_replace(new.report_pdf_path, '^/*(reports/)?', ''), '/', 1) <> v_uid::text then
        raise exception 'Reports must come from your own folder.' using errcode = '42501';
      end if;
    end if;
    return new;
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
         or new.doctor_id = v_uid);

  -- Patient: may cancel, and attach a report from their own storage folder.
  v_patient_ok := old.patient_id = v_uid
    and new.patient_id is not distinct from old.patient_id
    and new.clinic_id is not distinct from old.clinic_id
    and new.doctor_id is not distinct from old.doctor_id
    and new.scheduled_at is not distinct from old.scheduled_at
    and new.created_at is not distinct from old.created_at
    and (new.status is not distinct from old.status or new.status = 'cancelled')
    and (new.report_pdf_path is not distinct from old.report_pdf_path
         or new.report_pdf_path is null
         or split_part(regexp_replace(new.report_pdf_path, '^/*(reports/)?', ''), '/', 1) = v_uid::text);

  if v_doctor_ok or v_patient_ok then
    return new;
  end if;
  raise exception 'You are not allowed to make that change to this appointment.'
    using errcode = '42501';
end $$;

drop trigger if exists appointments_guard_write on public.appointments;
create trigger appointments_guard_write
  before insert or update on public.appointments
  for each row execute function public.guard_appointment_write();

-- ── 4. role can't be self-assigned ────────────────────────────────────────
create or replace function public.guard_user_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'patient';
  elsif new.role is distinct from old.role then
    raise exception 'Role can only be changed with a clinic invite code.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists user_profile_guard_role on public.user_profile;
create trigger user_profile_guard_role
  before insert or update on public.user_profile
  for each row execute function public.guard_user_profile_role();

-- ── 5. baseline owner-only RLS for dashboard-created tables ───────────────
-- Owner column: `user_id` when present, else `id` (user_profile,
-- skin_profile, lifestyle_profile are keyed by the auth user id).
-- Additive: existing policies are kept (see the audit query at the top).
do $$
declare
  t text;
  v_col text;
  v_type text;
  v_expr text;
begin
  foreach t in array array[
    'user_profile', 'skin_profile', 'lifestyle_profile', 'results',
    'routines', 'routine_progress', 'notifications'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, table not found', t;
      continue;
    end if;

    select c.column_name, c.udt_name into v_col, v_type
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t
      and c.column_name in ('user_id', 'id')
    order by (c.column_name = 'user_id') desc
    limit 1;

    if v_col is null then
      raise notice 'skipping %, no owner column', t;
      continue;
    end if;

    v_expr := case when v_type = 'uuid'
      then format('(select auth.uid()) = %I', v_col)
      else format('(select auth.uid())::text = %I::text', v_col)
    end;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ': owner all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
      t || ': owner all', t, v_expr, v_expr
    );
  end loop;
end $$;

-- ── 6. in-app account deletion ────────────────────────────────────────────
-- Report PDFs must be removed by the app first through the Storage API
-- (direct SQL deletes on storage.objects are blocked by Supabase). This
-- wipes every row the user owns, then the auth user itself.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t text;
  v_col text;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;

  delete from public.appointments where patient_id = v_uid;
  update public.appointments
  set doctor_id = null, scheduled_at = null, status = 'requested'
  where doctor_id = v_uid and status in ('requested', 'scheduled');
  delete from public.doctors where user_id = v_uid;

  foreach t in array array[
    'notifications', 'routine_progress', 'routines', 'sensitivity_history',
    'results', 'skin_profile', 'lifestyle_profile', 'user_profile'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    select c.column_name into v_col
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t
      and c.column_name in ('user_id', 'id')
    order by (c.column_name = 'user_id') desc
    limit 1;
    if v_col is not null then
      execute format('delete from public.%I where %I::text = $1', t, v_col)
      using v_uid::text;
    end if;
  end loop;

  delete from auth.users where id = v_uid;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
