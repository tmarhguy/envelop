-- 005: admin verify + bridge-grant controls. The last jobs that needed
-- the dashboard SQL editor.
-- Self-contained and re-runnable: run this whole file once in the
-- Supabase SQL editor (after 004). Requires the admins table from 003.
-- The Tomato device row is never touched: verify refuses devices and
-- grants require one.

create or replace function public.admin_set_verified(p_user uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from envelop_private.admins where user_id = auth.uid()) then
    raise exception 'Admin required';
  end if;
  update public.profiles set verified = p_verified
  where id = p_user and not is_device;
  if not found then
    raise exception 'Invalid profile';
  end if;
end;
$$;

create or replace function public.admin_grant_bridge(p_device uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from envelop_private.admins where user_id = auth.uid()) then
    raise exception 'Admin required';
  end if;
  if p_device is null or p_user is null
     or not exists (select 1 from public.profiles where id = p_device and is_device)
     or not exists (select 1 from public.profiles where id = p_user and not is_device) then
    raise exception 'Invalid device or profile';
  end if;
  insert into envelop_private.bridge_grants(device_id, user_id)
  values (p_device, p_user)
  on conflict(device_id, user_id) do nothing;
end;
$$;

create or replace function public.admin_revoke_bridge(p_device uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from envelop_private.admins where user_id = auth.uid()) then
    raise exception 'Admin required';
  end if;
  delete from envelop_private.bridge_grants
  where device_id = p_device and user_id = p_user;
end;
$$;

revoke all on function public.admin_set_verified(uuid, boolean) from public, anon;
revoke all on function public.admin_grant_bridge(uuid, uuid) from public, anon;
revoke all on function public.admin_revoke_bridge(uuid, uuid) from public, anon;
grant execute on function public.admin_set_verified(uuid, boolean) to authenticated;
grant execute on function public.admin_grant_bridge(uuid, uuid) to authenticated;
grant execute on function public.admin_revoke_bridge(uuid, uuid) to authenticated;
