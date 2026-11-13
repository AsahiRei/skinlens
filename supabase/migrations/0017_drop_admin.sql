-- 0017_drop_admin.sql
-- Removes the website admin console's database objects. The mobile app never
-- reads or writes these; they were only used by the admin console via the
-- service-role key:
--   * audit_logs    (0009) — admin action history
--   * site_settings (0013) — admin-edited key/value settings (download_url)
--
-- Clinics, doctors and clinic_invite_codes stay: the app depends on them.
-- Without the console, manage them from the Supabase Dashboard table editor.
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → paste → Run. Idempotent.
-- WARNING: permanently deletes all audit log rows and site settings.

drop table if exists public.audit_logs;
drop table if exists public.site_settings;

notify pgrst, 'reload schema';
