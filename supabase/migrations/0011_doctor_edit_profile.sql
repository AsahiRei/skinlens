-- Doctor "Edit profile" on the Account tab.
--
-- public.doctors has no client UPDATE policy on purpose: a plain policy would
-- also let a doctor rewrite clinic_id (skipping the invite-code check) or
-- is_active. This function only touches display_name and specialty on the
-- caller's own row.

create or replace function public.update_my_doctor_profile(
  p_display_name text,
  p_specialty text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_display_name, ''));
  v_specialty text := nullif(trim(coalesce(p_specialty, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if length(v_name) < 2 then
    raise exception 'Display name is too short.';
  end if;
  if length(v_name) > 80 then
    raise exception 'Display name is too long.';
  end if;
  if v_specialty is not null and length(v_specialty) > 80 then
    raise exception 'Specialty is too long.';
  end if;

  update public.doctors
  set display_name = v_name,
      specialty = coalesce(v_specialty, specialty)
  where user_id = auth.uid();

  if not found then
    raise exception 'No doctor profile — link your hospital first.';
  end if;
end;
$$;

revoke execute on function public.update_my_doctor_profile(text, text) from public, anon;
grant execute on function public.update_my_doctor_profile(text, text) to authenticated;
