-- 0005_patient_names.sql
-- Doctor queue shows "Patient" instead of the patient's username because:
--   1. user_profile.first_name may not exist server-side (the app's SQLite
--      added it locally, but the server ALTER was never confirmed), so a
--      `select id, username, first_name` fails and yields zero names; and
--   2. user_profile rows are typically locked to their owner, so a doctor
--      querying patient profiles gets zero rows back.
--
-- This migration:
--   a. ensures user_profile.first_name exists,
--   b. adds appointments.patient_name (booking-time display-name snapshot,
--      so the queue works without user_profile access at all),
--   c. backfills the snapshot for existing rows where possible,
--   d. adds get_patient_display_names(uuid[]) — SECURITY DEFINER lookup that
--      returns ONLY id/username/first_name for the caller's own clinic
--      patients (or the caller's own row). Never exposes emails.
--
-- HOW TO APPLY (pick one):
--   1. Supabase Dashboard → SQL Editor → paste this file → Run, or
--   2. supabase db push   (from the C:\skinlens folder, if linked)
--
-- Idempotent — safe to run more than once.

-- ── a. first_name on user_profile ─────────────────────────────────────
alter table public.user_profile
  add column if not exists first_name text;

-- ── b. booking-time snapshot on appointments ──────────────────────────
alter table public.appointments
  add column if not exists patient_name text;

-- ── c. backfill snapshots from profiles where readable ────────────────
update public.appointments a
set patient_name = nullif(
  trim(
    case
      when u.first_name is not null and u.first_name <> ''
        and u.username is not null and u.username <> ''
        then u.first_name || ' (@' || u.username || ')'
      when u.first_name is not null and u.first_name <> ''
        then u.first_name
      when u.username is not null and u.username <> ''
        then case
          when u.username like '@%' then u.username
          else '@' || u.username
        end
      else null
    end
  ),
  ''
)
from public.user_profile u
where a.patient_id = u.id
  and (a.patient_name is null or a.patient_name = '');

-- ── d. doctor-safe name lookup (no email exposure) ────────────────────
create or replace function public.get_patient_display_names(p_ids uuid[])
returns table (
  id uuid,
  username text,
  first_name text
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.username, u.first_name
  from public.user_profile u
  where u.id = any(p_ids)
    and (
      u.id = auth.uid()
      or exists (
        select 1
        from public.doctors d
        join public.appointments appt
          on appt.clinic_id = d.clinic_id
         and appt.patient_id = u.id
        where d.user_id = auth.uid()
          and d.is_active = true
      )
    );
$$;

revoke all on function public.get_patient_display_names(uuid[]) from public, anon;
grant execute on function public.get_patient_display_names(uuid[]) to authenticated;

notify pgrst, 'reload schema';
