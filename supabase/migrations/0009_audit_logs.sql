-- 0009_audit_logs.sql
-- Audit logging for administrative actions performed via the website admin console.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,           -- e.g., 'SAVE_CLINIC', 'DELETE_CODE'
  entity_type text not null,      -- e.g., 'clinics', 'clinic_invite_codes'
  entity_id uuid,                -- ID of the affected row
  old_value jsonb,                -- State before change
  new_value jsonb,                -- State after change
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.audit_logs enable row level security;

-- Only allow service role (admin console) to insert and read logs.
-- No public/authenticated policies are added, meaning only the admin client
-- (which bypasses RLS) can access this table.

notify pgrst, 'reload schema';
