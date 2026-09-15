-- 006: pinned people. A pinned human stays listed like Tomato,
-- honestly Online or Offline, instead of vanishing on timeout.
-- Self-contained and re-runnable: run this whole file once in the
-- Supabase SQL editor (after 005). Pin with:
--   update public.profiles set pinned = true where display_name = 'NAME';
-- or the admin RPC below. Renaming preserves the pin; leaving,
-- removal, or flush clears it with the profile.

alter table public.profiles
  add column if not exists pinned boolean not null default false;

create or replace function public.admin_set_pinned(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from envelop_private.admins where user_id = auth.uid()) then
    raise exception 'Admin required';
  end if;
  update public.profiles set pinned = coalesce(p_on, false)
  where id = p_user and not is_device;
  if not found then
    raise exception 'Invalid profile';
  end if;
end;
$$;

revoke all on function public.admin_set_pinned(uuid, boolean) from public, anon;
grant execute on function public.admin_set_pinned(uuid, boolean) to authenticated;
