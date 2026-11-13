-- Health context collected at first login (and editable in Edit Profile) that changes what the
-- app may safely recommend:
--   pregnancy_status  – retinoids are left out of routines when 'yes' or 'prefer_not_to_say'
--   current_treatment – prescribed treatment: no extra retinoid is stacked on top of it
--   sunscreen_use     – scored lifestyle habit (replaces scoring the skin *type*)
--
-- Kept in its own table so the existing skin_profile / lifestyle_profile upserts (which write
-- whole rows) can never wipe these values. Owner-only: doctors don't read it.

create table if not exists public.health_profile (
  id                uuid primary key references auth.users (id) on delete cascade,
  pregnancy_status  text,
  current_treatment text,
  sunscreen_use     text,
  updated_at        timestamptz not null default now(),
  constraint health_profile_pregnancy_check
    check (pregnancy_status is null or pregnancy_status in ('no', 'yes', 'prefer_not_to_say')),
  constraint health_profile_treatment_check
    check (current_treatment is null or current_treatment in ('none', 'topical', 'oral', 'not_sure')),
  constraint health_profile_sunscreen_check
    check (sunscreen_use is null or sunscreen_use in ('daily', 'most_days', 'sometimes', 'rarely'))
);

alter table public.health_profile enable row level security;

drop policy if exists "health_profile: owner all" on public.health_profile;
create policy "health_profile: owner all"
  on public.health_profile
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

notify pgrst, 'reload schema';
