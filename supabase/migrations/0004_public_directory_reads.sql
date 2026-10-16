-- 0004_public_directory_reads.sql
-- Makes the VERIFIED HOSPITAL + DOCTOR DIRECTORY publicly readable.
--
-- WHY: the website admin page connects with the publishable key (anonymous),
-- and migration 0002 only granted reads to signed-in users — so Supabase
-- returned zero rows. Hospital names, addresses, phones and doctor names are
-- directory info the app already shows every user, so public reads are safe.
--
-- STAYS LOCKED: clinic_invite_codes (codes are passwords) and appointments
-- (patient data) remain signed-in-only, and ALL writes still need a Secret
-- key or a signed-in admin — anonymous writes are never allowed.
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → paste → Run. Idempotent.

-- Anyone (including logged-out app users) can read active hospitals.
drop policy if exists "directory: public read active clinics" on public.clinics;
create policy "directory: public read active clinics"
  on public.clinics for select
  to anon, authenticated
  using (is_active = true);

-- Anyone can read the active doctor directory (names + clinic + specialty).
drop policy if exists "directory: public read doctors" on public.doctors;
create policy "directory: public read doctors"
  on public.doctors for select
  to anon, authenticated
  using (is_active = true);

notify pgrst, 'reload schema';
