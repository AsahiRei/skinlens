-- 0003_verified_clinics_seed.sql
-- Display columns used by the app + the two locations that used to be
-- hardcoded in data/derma-locations.json (deleted from the repo — the Derma
-- tab now queries public.clinics instead).
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Idempotent: fixed UUIDs + ON CONFLICT DO UPDATE, safe to re-run.

-- Display columns (idempotent if 0002 was already run).
alter table public.clinics
  add column if not exists rating numeric not null default 0;
alter table public.clinics
  add column if not exists available_today boolean not null default false;

-- Seed: the former hardcoded entries, now managed from the admin page.
insert into public.clinics (
  id, name, specialty, address,
  latitude, longitude, rating, available_today,
  phone, website, hours, description, is_active
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'SkinLens Partner Clinic', 'Dermatology', '123 Sample St, Manila',
    14.5995, 120.9842, 4.8, true,
    '+63 2 8555 0100', 'https://example.com/clinic',
    'Mon–Sat, 9:00 AM – 5:00 PM',
    'Partner clinic for consultations and follow-ups. Walk-ins welcome.',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Downtown Skin Center', 'Dermatology', '456 Example Ave, Quezon City',
    14.676, 121.0437, 4.6, false,
    '+63 2 8555 0200', '',
    'Mon–Fri, 10:00 AM – 6:00 PM',
    'Specializes in acne and eczema care.',
    true
  )
on conflict (id) do update set
  name            = excluded.name,
  specialty       = excluded.specialty,
  address         = excluded.address,
  latitude        = excluded.latitude,
  longitude       = excluded.longitude,
  rating          = excluded.rating,
  available_today = excluded.available_today,
  phone           = excluded.phone,
  website         = excluded.website,
  hours           = excluded.hours,
  description     = excluded.description,
  is_active       = excluded.is_active,
  updated_at      = now();

notify pgrst, 'reload schema';
