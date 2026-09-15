-- 002: editable display name + its missing helper.
-- Self-contained and re-runnable: run this whole file once in the
-- Supabase SQL editor. Do NOT re-run 001 (tables, policies and live
-- function bodies already exist up there; a replay only collides).
-- Only the authenticated human's display name is editable. Keep identity,
-- handle, device flags and bridge permissions unchanged.

-- Helper 002 depends on. Absent on live projects created before it.
create or replace function public.require_user()
returns uuid
language plpgsql
stable
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  return uid;
end;
$$;
revoke all on function public.require_user() from public, anon, authenticated;

create or replace function public.update_profile_name(p_name text)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := public.require_user();
  cleaned text := trim(p_name);
  result public.profiles;
begin
  if cleaned is null or char_length(cleaned) < 1 or char_length(cleaned) > 32 then
    raise exception 'Name must be 1–32 characters';
  end if;
  update public.profiles set display_name = cleaned
  where id = uid and not is_device returning * into result;
  if not found then raise exception 'Human profile required'; end if;
  return result;
end;
$$;
revoke all on function public.update_profile_name(text) from public, anon;
grant execute on function public.update_profile_name(text) to authenticated;
