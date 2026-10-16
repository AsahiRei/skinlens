-- 0006_patient_avatars.sql
-- Show the patient's profile picture (face-enroll photo) in the doctor
-- queue alongside the display name.
--
-- Only photos already uploaded to Cloudinary (http(s) URLs) can be shown on
-- another device — offline enrolls stay as local file:// paths that are
-- meaningless on the doctor's phone, so those are never stored/shared.
--
-- This migration:
--   a. adds appointments.patient_avatar_url (booking-time snapshot),
--   b. backfills it from user_profile.face_image_url where remote,
--   c. extends get_patient_display_names(uuid[]) with face_image_url
--      (still no emails — id/username/first_name/face_image_url only).
--
-- HOW TO APPLY (pick one):
--   1. Supabase Dashboard → SQL Editor → paste this file → Run, or
--   2. supabase db push   (from the C:\skinlens folder, if linked)
--
-- Idempotent — safe to run more than once.

-- ── a. avatar snapshot on appointments ────────────────────────────────
alter table public.appointments
  add column if not exists patient_avatar_url text;

-- ── b. backfill remote photos only ────────────────────────────────────
update public.appointments a
set patient_avatar_url = u.face_image_url
from public.user_profile u
where a.patient_id = u.id
  and (a.patient_avatar_url is null or a.patient_avatar_url = '')
  and u.face_image_url is not null
  and u.face_image_url like 'http%';

-- ── c. extend the doctor-safe lookup (return type change needs a drop) ─
drop function if exists public.get_patient_display_names(uuid[]);

create function public.get_patient_display_names(p_ids uuid[])
returns table (
  id uuid,
  username text,
  first_name text,
  face_image_url text
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.username, u.first_name, u.face_image_url
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
