-- 004: human presence. Who is online right now.
-- Self-contained and re-runnable: run this whole file once in the
-- Supabase SQL editor (after 003). Clients heartbeat every ~15s and
-- treat last_seen within 45s as online. Timeouts only hide people;
-- nothing is deleted except by explicit leave, admin remove, or flush.
-- The Tomato device row never heartbeats; its presence stays lease-based.

create table if not exists public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now()
);

alter table public.presence enable row level security;

drop policy if exists presence_select on public.presence;
create policy presence_select on public.presence
  for select to authenticated using (true);

revoke all on public.presence from public, anon, authenticated;
grant select on public.presence to authenticated;

-- Record the caller as online now. Callers heartbeat only once named
-- (the row references their profile); profile deletes cascade here,
-- so remove/flush/leave need no extra cleanup for presence.
create or replace function public.heartbeat()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.presence(user_id, last_seen)
  values (auth.uid(), now())
  on conflict(user_id) do update set last_seen = excluded.last_seen;
end;
$$;

-- Leave the network: wipe the caller exactly like an admin remove
-- wipes anyone (both sides of their DMs go; the device row is safe).
create or replace function public.leave_network()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = uid and is_device) then
    raise exception 'Invalid profile';
  end if;
  delete from public.device_queue where message_id in (
    select m.id from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where c.participant_a = uid or c.participant_b = uid);
  delete from public.messages where conversation_id in (
    select id from public.conversations
    where participant_a = uid or participant_b = uid);
  delete from public.conversations where participant_a = uid or participant_b = uid;
  delete from public.device_bridges where bridge_user_id = uid;
  delete from envelop_private.bridge_grants where user_id = uid;
  delete from envelop_private.admins where user_id = uid;
  delete from public.presence where user_id = uid;
  delete from public.profiles where id = uid;
end;
$$;

revoke all on function public.heartbeat() from public, anon;
revoke all on function public.leave_network() from public, anon;
grant execute on function public.heartbeat() to authenticated;
grant execute on function public.leave_network() to authenticated;
