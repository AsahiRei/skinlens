-- 0013_site_settings.sql
-- Key/value settings edited from the website admin console
-- (e.g. 'download_url' for the landing page's "Download for Android" button).

create table if not exists public.site_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.site_settings enable row level security;

-- No public/authenticated policies: only the website server (secret key,
-- bypasses RLS) reads and writes this table.

insert into public.site_settings (key, value)
values ('download_url', '')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
