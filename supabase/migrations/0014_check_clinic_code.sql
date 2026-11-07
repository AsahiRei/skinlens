-- 0014_check_clinic_code.sql
-- Read-only invite-code check used by the doctor Register flow BEFORE
-- supabase.auth.signUp(). Previously a bad code was only detected after the
-- auth user already existed, leaving an orphan account the doctor couldn't
-- re-register with. Now the app validates first and only creates the
-- account when the code is good.
--
-- It does NOT burn a use — redeem_clinic_code() still does that atomically
-- after sign-up (a code can still run out in between; the app then routes
-- the signed-in user to the "finish doctor setup" screen).
--
-- Callable by anon because the user has no session yet. It only reveals the
-- clinic name for a valid code, which redeem_clinic_code() already exposes
-- to any signed-in user, so this adds no new enumeration surface.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run, or
-- `supabase db push`. Idempotent — safe to re-run.

create or replace function public.check_clinic_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code public.clinic_invite_codes%rowtype;
  v_clinic public.clinics%rowtype;
begin
  select * into v_code
  from public.clinic_invite_codes
  where upper(trim(code)) = upper(trim(p_code));

  -- Same messages as redeem_clinic_code() so the app shows one wording.
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

  select * into v_clinic from public.clinics where id = v_code.clinic_id;
  if not found or not v_clinic.is_active then
    raise exception 'This hospital is not active.';
  end if;

  return jsonb_build_object(
    'clinic_id', v_clinic.id,
    'clinic_name', v_clinic.name
  );
end $$;

revoke execute on function public.check_clinic_code(text) from public;
grant execute on function public.check_clinic_code(text) to anon, authenticated;

notify pgrst, 'reload schema';
