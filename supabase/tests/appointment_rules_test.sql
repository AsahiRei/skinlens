-- Appointment rules test (migration 0015)
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and click Run.
-- NOTHING IS SAVED. The script ends by raising an "error" whose message IS the
-- test report, which also rolls back every test row. So a red box listing
-- PASS / FAIL lines is the expected outcome.
--
-- Needs: one clinic with an active doctor, plus two other (patient) accounts.

-- Runs one statement as a signed-in user (same role + JWT the app uses) and
-- returns "OK rows=N" or "ERR <message>".
create or replace function pg_temp.try_as(p_uid uuid, p_sql text)
returns text
language plpgsql
as $f$
declare
  n int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  set local role authenticated;
  execute p_sql;
  get diagnostics n = row_count;
  reset role;
  return 'OK rows=' || n;
exception when others then
  return 'ERR ' || sqlerrm;
end $f$;

do $$
declare
  v_doctor  uuid;
  v_clinic  uuid;
  v_pa      uuid;   -- patient A
  v_pb      uuid;   -- patient B
  v_a       uuid;   -- A's appointment
  v_b       uuid;   -- B's appointment
  t         timestamptz := date_trunc('day', now()) + interval '30 days' + interval '7 hours'; -- 3:00 PM PH
  r         text;
  s         text;
  report    text := '';
  passed    int := 0;
  failed    int := 0;
begin
  -- ── fixtures ──
  select d.user_id, d.clinic_id into v_doctor, v_clinic
  from public.doctors d where d.is_active = true limit 1;
  if v_doctor is null then
    raise exception 'SETUP: no active doctor found — register a doctor account first.';
  end if;

  select u.id into v_pa from auth.users u
  where not exists (select 1 from public.doctors d where d.user_id = u.id)
  order by u.created_at limit 1;
  select u.id into v_pb from auth.users u
  where not exists (select 1 from public.doctors d where d.user_id = u.id)
    and u.id <> v_pa
  order by u.created_at limit 1;
  if v_pa is null or v_pb is null then
    raise exception 'SETUP: need two patient accounts — register two patients first.';
  end if;

  -- Patient rows are created as the patients themselves (through the guard).
  v_a := gen_random_uuid();
  v_b := gen_random_uuid();

  -- T1 patient A requests Dr at 3:00 PM
  r := pg_temp.try_as(v_pa, format(
    'insert into public.appointments (id, patient_id, clinic_id, doctor_id, preferred_time)
     values (%L, %L, %L, %L, %L)', v_a, v_pa, v_clinic, v_doctor, t));
  if r = 'OK rows=1' then passed := passed + 1; report := report || E'\nPASS  T1  Patient A requests 3:00 PM';
  else failed := failed + 1; report := report || E'\nFAIL  T1  Patient A requests 3:00 PM — ' || r; end if;

  -- T2 patient B requests the SAME 3:00 PM (allowed: nothing confirmed yet)
  r := pg_temp.try_as(v_pb, format(
    'insert into public.appointments (id, patient_id, clinic_id, doctor_id, preferred_time)
     values (%L, %L, %L, %L, %L)', v_b, v_pb, v_clinic, v_doctor, t));
  if r = 'OK rows=1' then passed := passed + 1; report := report || E'\nPASS  T2  Patient B requests the same 3:00 PM';
  else failed := failed + 1; report := report || E'\nFAIL  T2  Patient B requests the same 3:00 PM — ' || r; end if;

  -- T3 doctor confirms A at 3:00 PM
  r := pg_temp.try_as(v_doctor, format(
    'update public.appointments set status = ''scheduled'', scheduled_at = %L, doctor_id = %L where id = %L',
    t, v_doctor, v_a));
  if r = 'OK rows=1' then passed := passed + 1; report := report || E'\nPASS  T3  Doctor confirms A at 3:00 PM';
  else failed := failed + 1; report := report || E'\nFAIL  T3  Doctor confirms A at 3:00 PM — ' || r; end if;

  -- T4 B was bumped automatically
  select status into s from public.appointments where id = v_b;
  if s = 'needs_reschedule' then passed := passed + 1; report := report || E'\nPASS  T4  B auto-moved to needs_reschedule';
  else failed := failed + 1; report := report || E'\nFAIL  T4  B auto-moved to needs_reschedule — status is ' || coalesce(s, 'null'); end if;

  -- T5 get_taken_slots shows 3:00 PM as booked (times only)
  perform set_config('request.jwt.claims', json_build_object('sub', v_pb, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_pb::text, true);
  if exists (select 1 from public.get_taken_slots(v_clinic, v_doctor, t - interval '1 hour', t + interval '1 hour') x where x = t)
  then passed := passed + 1; report := report || E'\nPASS  T5  get_taken_slots lists 3:00 PM';
  else failed := failed + 1; report := report || E'\nFAIL  T5  get_taken_slots lists 3:00 PM'; end if;

  -- T6 B tries 3:10 PM (overlaps the 30-min slot) → blocked
  r := pg_temp.try_as(v_pb, format(
    'update public.appointments set preferred_time = %L, status = ''requested'' where id = %L',
    t + interval '10 minutes', v_b));
  if r like 'ERR%already booked%' then passed := passed + 1; report := report || E'\nPASS  T6  B cannot re-pick 3:10 PM (overlap)';
  else failed := failed + 1; report := report || E'\nFAIL  T6  B cannot re-pick 3:10 PM (overlap) — ' || r; end if;

  -- T7 B picks 4:00 PM → back to requested
  r := pg_temp.try_as(v_pb, format(
    'update public.appointments set preferred_time = %L, status = ''requested'' where id = %L',
    t + interval '1 hour', v_b));
  select status into s from public.appointments where id = v_b;
  if r = 'OK rows=1' and s = 'requested' then passed := passed + 1; report := report || E'\nPASS  T7  B re-picks 4:00 PM → requested';
  else failed := failed + 1; report := report || E'\nFAIL  T7  B re-picks 4:00 PM — ' || r || ' / status ' || coalesce(s, 'null'); end if;

  -- T8 a brand-new request at the taken 3:00 PM → blocked
  r := pg_temp.try_as(v_pb, format(
    'insert into public.appointments (patient_id, clinic_id, doctor_id, preferred_time)
     values (%L, %L, %L, %L)', v_pb, v_clinic, v_doctor, t));
  if r like 'ERR%already booked%' then passed := passed + 1; report := report || E'\nPASS  T8  New request at taken 3:00 PM blocked';
  else failed := failed + 1; report := report || E'\nFAIL  T8  New request at taken 3:00 PM blocked — ' || r; end if;

  -- T9 doctor schedules B at 3:15 PM (within 30 min of A) → blocked
  r := pg_temp.try_as(v_doctor, format(
    'update public.appointments set status = ''scheduled'', scheduled_at = %L, doctor_id = %L where id = %L',
    t + interval '15 minutes', v_doctor, v_b));
  if r like 'ERR%within 30 minutes%' then passed := passed + 1; report := report || E'\nPASS  T9  Doctor cannot double-book 3:15 PM';
  else failed := failed + 1; report := report || E'\nFAIL  T9  Doctor cannot double-book 3:15 PM — ' || r; end if;

  -- T10 doctor schedules B in the past → blocked
  r := pg_temp.try_as(v_doctor, format(
    'update public.appointments set status = ''scheduled'', scheduled_at = %L, doctor_id = %L where id = %L',
    now() - interval '1 hour', v_doctor, v_b));
  if r like 'ERR%already passed%' then passed := passed + 1; report := report || E'\nPASS  T10 Doctor cannot schedule in the past';
  else failed := failed + 1; report := report || E'\nFAIL  T10 Doctor cannot schedule in the past — ' || r; end if;

  -- T11 doctor schedules B at 4:00 PM → OK
  r := pg_temp.try_as(v_doctor, format(
    'update public.appointments set status = ''scheduled'', scheduled_at = %L, doctor_id = %L where id = %L',
    t + interval '1 hour', v_doctor, v_b));
  if r = 'OK rows=1' then passed := passed + 1; report := report || E'\nPASS  T11 Doctor schedules B at 4:00 PM';
  else failed := failed + 1; report := report || E'\nFAIL  T11 Doctor schedules B at 4:00 PM — ' || r; end if;

  -- T12 Mark as done BEFORE the visit time → blocked
  r := pg_temp.try_as(v_doctor, format(
    'update public.appointments set status = ''completed'' where id = %L', v_a));
  if r like 'ERR%can only be marked done from%' then passed := passed + 1; report := report || E'\nPASS  T12 Mark as done locked before 3:00 PM';
  else failed := failed + 1; report := report || E'\nFAIL  T12 Mark as done locked before 3:00 PM — ' || r; end if;

  -- Simulate the visit time arriving (admin edit, bypasses the guard).
  update public.appointments set scheduled_at = now() - interval '5 minutes' where id = v_a;

  -- T13 Mark as done AFTER the visit time → OK
  r := pg_temp.try_as(v_doctor, format(
    'update public.appointments set status = ''completed'' where id = %L', v_a));
  if r = 'OK rows=1' then passed := passed + 1; report := report || E'\nPASS  T13 Mark as done allowed after visit time';
  else failed := failed + 1; report := report || E'\nFAIL  T13 Mark as done allowed after visit time — ' || r; end if;

  -- T14 a completed visit is final (patient can't cancel it)
  r := pg_temp.try_as(v_pa, format(
    'update public.appointments set status = ''cancelled'' where id = %L', v_a));
  if r like 'ERR%already closed%' then passed := passed + 1; report := report || E'\nPASS  T14 Completed visit cannot be cancelled';
  else failed := failed + 1; report := report || E'\nFAIL  T14 Completed visit cannot be cancelled — ' || r; end if;

  raise exception E'TEST REPORT (rolled back, nothing saved): % passed, % failed%',
    passed, failed, report;
end $$;
