-- 003: admin controls. Who can remove people and flush the test network.
-- Self-contained and re-runnable: run this whole file once in the
-- Supabase SQL editor (after 002). Bootstrap your own admin row with:
--   insert into envelop_private.admins(user_id) values ('YOUR_PROFILE_UUID');
-- A flush wipes everything except the Tomato device row, admin rows
-- included — re-run the bootstrap insert afterwards to stay admin.
-- The Tomato device profile is never touched by either destructive RPC.

create table if not exists envelop_private.admins (
  user_id uuid not null references public.profiles(id),
  primary key (user_id)
);

create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from envelop_private.admins where user_id = auth.uid());
$$;

create or replace function public.admin_remove_profile(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from envelop_private.admins where user_id = auth.uid()) then
    raise exception 'Admin required';
  end if;
  if p_user is null
     or exists (select 1 from public.profiles where id = p_user and is_device) then
    raise exception 'Invalid profile';
  end if;
  -- Wipe both sides of every DM they belong to (a DM cannot survive one member).
  delete from public.device_queue where message_id in (
    select m.id from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where c.participant_a = p_user or c.participant_b = p_user);
  delete from public.messages where conversation_id in (
    select id from public.conversations
    where participant_a = p_user or participant_b = p_user);
  delete from public.conversations where participant_a = p_user or participant_b = p_user;
  delete from public.device_bridges where bridge_user_id = p_user;
  delete from envelop_private.bridge_grants where user_id = p_user;
  delete from envelop_private.admins where user_id = p_user;
  delete from public.profiles where id = p_user;
end;
$$;

create or replace function public.admin_flush()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from envelop_private.admins where user_id = auth.uid()) then
    raise exception 'Admin required';
  end if;
  delete from public.device_queue;
  delete from public.messages;
  delete from public.conversations;
  delete from public.device_bridges;
  delete from envelop_private.bridge_grants;
  delete from envelop_private.admins;
  delete from public.profiles where not is_device;
end;
$$;

revoke all on function public.am_i_admin() from public, anon;
revoke all on function public.admin_remove_profile(uuid) from public, anon;
revoke all on function public.admin_flush() from public, anon;
grant execute on function public.am_i_admin() to authenticated;
grant execute on function public.admin_remove_profile(uuid) to authenticated;
grant execute on function public.admin_flush() to authenticated;
