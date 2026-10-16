-- 0002_clinic_booking.sql
-- Verified hospitals + doctor invite codes + appointments + report PDFs.
--
-- HOW TO APPLY (pick one):
--   1. Supabase Dashboard → SQL Editor → paste this file → Run, or
--   2. supabase db push   (from the C:\skinlens folder, if linked)
--
-- Tables follow the existing repo pattern: owner/role-based RLS, and the
-- website admin console bypasses RLS with the SERVICE ROLE key (server-only).

-- ── clinics: verified hospitals managed from the website admin page ──────
create table if not exists public.clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  specialty   text not null default 'Dermatology',
  address     text not null default '',
  phone       text not null default '',
  website     text not null default '',
  hours       text not null default '',
  description text not null default '',
  latitude    double precision,  -- map pin + distance math (nullable until set)
  longitude   double precision,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Same columns, idempotent — safe if 0002 was already run before this update.
alter table public.clinics add column if not exists latitude double precision;
alter table public.clinics add column if not exists longitude double precision;

-- ── clinic_invite_codes: one code ties a doctor to ONE hospital ──────────
-- Clients never read this table directly (no SELECT policy); doctors redeem
-- codes through redeem_clinic_code() below. Admin manages it via service role.
create table if not exists public.clinic_invite_codes (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  code        text not null unique,
  max_uses    integer not null default 5 check (max_uses >= 1),
  used_count  integer not null default 0 check (used_count >= 0),
  expires_at  timestamptz not null default (now() + interval '90 days'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists clinic_invite_codes_clinic_idx
  on public.clinic_invite_codes (clinic_id);

-- ── role on user_profile (patient default, doctor via invite code) ────────
alter table public.user_profile
  add column if not exists role text not null default 'patient'
  check (role in ('patient', 'doctor'));

-- ── doctors: auth user linked to exactly one clinic ───────────────────────
create table if not exists public.doctors (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  clinic_id    uuid not null references public.clinics (id) on delete restrict,
  display_name text not null default '',
  specialty    text not null default 'Dermatology',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists doctors_clinic_idx on public.doctors (clinic_id);

-- ── appointments: patient requests → doctor schedules ────────────────────
create table if not exists public.appointments (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references auth.users (id) on delete cascade,
  clinic_id       uuid not null references public.clinics (id) on delete restrict,
  doctor_id       uuid references auth.users (id) on delete set null,
  report_pdf_path text,
  preferred_time  timestamptz,   -- patient suggestion (optional)
  scheduled_at    timestamptz,   -- doctor-set visit time
  status          text not null default 'requested'
    check (status in ('requested', 'scheduled', 'completed', 'cancelled', 'declined')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists appointments_patient_idx
  on public.appointments (patient_id, created_at desc);
create index if not exists appointments_clinic_idx
  on public.appointments (clinic_id, status, created_at desc);

-- ── updated_at trigger ────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists clinics_set_updated_at on public.clinics;
create trigger clinics_set_updated_at
  before update on public.clinics
  for each row execute function public.set_updated_at();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.clinics enable row level security;
alter table public.clinic_invite_codes enable row level security;
alter table public.doctors enable row level security;
alter table public.appointments enable row level security;

-- clinics: any signed-in app user can read active ones (verified list);
-- admin writes via service role (bypasses RLS).
drop policy if exists "clinics: authenticated read active" on public.clinics;
create policy "clinics: authenticated read active"
  on public.clinics for select
  to authenticated using (is_active = true);

-- invite codes: NO client policies at all — only service role + the
-- redeem function below (security definer) touch this table.

-- doctors: signed-in users can see the directory (name/clinic/specialty —
-- no PII beyond what the doctor registered with). Rows are only created
-- through redeem_clinic_code().
drop policy if exists "doctors: authenticated read" on public.doctors;
create policy "doctors: authenticated read"
  on public.doctors for select
  to authenticated using (true);

-- appointments, patient side: full access to own rows.
drop policy if exists "appointments: patient select own" on public.appointments;
create policy "appointments: patient select own"
  on public.appointments for select
  to authenticated using (auth.uid() = patient_id);

drop policy if exists "appointments: patient insert own" on public.appointments;
create policy "appointments: patient insert own"
  on public.appointments for insert
  to authenticated with check (auth.uid() = patient_id);

drop policy if exists "appointments: patient cancel own" on public.appointments;
create policy "appointments: patient cancel own"
  on public.appointments for update
  to authenticated
  using (auth.uid() = patient_id)
  with check (auth.uid() = patient_id);

-- appointments, doctor side: read + schedule appointments of THEIR clinic.
drop policy if exists "appointments: doctor select own clinic" on public.appointments;
create policy "appointments: doctor select own clinic"
  on public.appointments for select
  to authenticated using (
    exists (
      select 1 from public.doctors d
      where d.user_id = auth.uid()
        and d.is_active = true
        and d.clinic_id = appointments.clinic_id
    )
  );

drop policy if exists "appointments: doctor update own clinic" on public.appointments;
create policy "appointments: doctor update own clinic"
  on public.appointments for update
  to authenticated
  using (
    exists (
      select 1 from public.doctors d
      where d.user_id = auth.uid()
        and d.is_active = true
        and d.clinic_id = appointments.clinic_id
    )
  )
  with check (
    exists (
      select 1 from public.doctors d
      where d.user_id = auth.uid()
        and d.is_active = true
        and d.clinic_id = appointments.clinic_id
    )
  );

-- ── redeem_clinic_code: doctor self-registration ──────────────────────────
-- Called authenticated from the app as:
--   select * from redeem_clinic_code('SKN-XXXXXX', 'Dr. Jane Cruz');
-- Atomically: validates code → links doctor to that ONE clinic →
-- stamps role='doctor' → burns one use. Returns the clinic on success.
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

  if exists (select 1 from public.doctors where user_id = auth.uid()) then
    raise exception 'This account is already registered as a doctor.';
  end if;

  select * into v_clinic from public.clinics where id = v_code.clinic_id;
  if not found or not v_clinic.is_active then
    raise exception 'This hospital is not active.';
  end if;

  insert into public.doctors (user_id, clinic_id, display_name, specialty)
  values (auth.uid(), v_code.clinic_id, trim(p_display_name), trim(p_specialty));

  update public.user_profile set role = 'doctor' where id = auth.uid();

  update public.clinic_invite_codes
  set used_count = used_count + 1
  where id = v_code.id;

  return jsonb_build_object(
    'clinic_id', v_clinic.id,
    'clinic_name', v_clinic.name
  );
end $$;

-- ── reports bucket: Skin Report PDFs attached to appointments ─────────────
-- Private bucket. App uploads to reports/<patient_uid>/<appointment_id>.pdf
-- so insert is locked to the patient's own folder. Reads allow any signed-in
-- user because doctors must open THEIR patients' PDFs and storage RLS cannot
-- join the appointments table — paths are unguessable UUIDs (v1 tradeoff;
-- move to signed URLs later if stricter isolation is needed).
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

drop policy if exists "reports: patient upload own folder" on storage.objects;
create policy "reports: patient upload own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "reports: authenticated read" on storage.objects;
create policy "reports: authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'reports');

drop policy if exists "reports: patient delete own folder" on storage.objects;
create policy "reports: patient delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
