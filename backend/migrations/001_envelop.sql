-- Envelop 001: profiles, DMs, messages, Tomato queue, bridge leases.
-- Apply once via the Supabase SQL editor (or any migration runner).
-- gen_random_uuid() is provided by core PostgreSQL 13+ / Supabase / PGlite.

create schema if not exists envelop_private;

create table public.profiles (
  id uuid primary key,
  handle text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_id int not null check (avatar_id between 0 and 15),
  is_device boolean not null default false,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles(id),
  participant_b uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (participant_a < participant_b),
  unique (participant_a, participant_b)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  sender_id uuid not null references public.profiles(id),
  body text not null check (octet_length(body) between 1 and 256),
  client_nonce uuid not null,
  created_at timestamptz not null default now(),
  unique (sender_id, client_nonce)
);

create table public.device_queue (
  message_id uuid primary key references public.messages(id) on delete cascade,
  device_id uuid not null references public.profiles(id),
  state text not null check (state in ('queued', 'acked')),
  created_at timestamptz not null default now(),
  forwarded_at timestamptz,
  acked_at timestamptz
);

create table public.device_bridges (
  device_id uuid primary key references public.profiles(id),
  bridge_user_id uuid not null references public.profiles(id),
  bridge_instance_id uuid not null,
  expires_at timestamptz not null,
  last_heartbeat timestamptz not null default now()
);

create table envelop_private.bridge_grants (
  device_id uuid not null references public.profiles(id),
  user_id uuid not null references public.profiles(id),
  primary key (device_id, user_id)
);

create or replace view public.conversation_members
  with (security_invoker = true)
as
  select id as conversation_id, participant_a as profile_id from public.conversations
  union all
  select id, participant_b from public.conversations;

insert into public.profiles (id, handle, display_name, avatar_id, is_device, verified)
values (
  '00000000-0000-0000-0000-000000000001',
  'tomato',
  'Tomato',
  0,
  true,
  true
);

create or replace function public.is_conversation_member(p_conversation uuid, p_user uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation
      and (c.participant_a = p_user or c.participant_b = p_user)
  );
$$;

create or replace function public.peer_in_conversation(p_conversation uuid, p_user uuid)
returns uuid
language sql
stable
as $$
  select case
    when c.participant_a = p_user then c.participant_b
    when c.participant_b = p_user then c.participant_a
    else null
  end
  from public.conversations c
  where c.id = p_conversation;
$$;

create or replace function public.queue_device_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  select case
    when c.participant_a = new.sender_id then c.participant_b
    else c.participant_a
  end into recipient
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient is not null
     and exists (select 1 from public.profiles p where p.id = recipient and p.is_device)
     and not exists (select 1 from public.profiles p where p.id = new.sender_id and p.is_device)
  then
    insert into public.device_queue (message_id, device_id, state)
    values (new.id, recipient, 'queued')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger messages_queue_device
  after insert on public.messages
  for each row execute function public.queue_device_message();

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

create or replace function public.active_bridge(p_device uuid)
returns public.device_bridges
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row public.device_bridges;
begin
  select * into row from public.device_bridges
  where device_id = p_device and expires_at > now();
  return row;
end;
$$;

create or replace function public.create_profile(p_name text, p_avatar int)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_user();
  cleaned text := trim(p_name);
  base text;
  row public.profiles;
begin
  if cleaned is null or char_length(cleaned) < 1 or char_length(cleaned) > 32 then
    raise exception 'Name must be 1–32 characters';
  end if;
  if p_avatar < 0 or p_avatar > 15 then
    raise exception 'Invalid avatar';
  end if;
  if exists (select 1 from public.profiles where id = uid) then
    select * into row from public.profiles where id = uid;
    return row;
  end if;
  base := lower(regexp_replace(cleaned, '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if base = '' then base := 'user'; end if;
  insert into public.profiles (id, handle, display_name, avatar_id)
  values (
    uid,
    left(base, 24) || '-' || substr(replace(uid::text, '-', ''), 1, 4),
    cleaned,
    p_avatar
  )
  returning * into row;
  return row;
end;
$$;

create or replace function public.get_or_create_dm(p_peer uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_user();
  a uuid;
  b uuid;
  cid uuid;
begin
  if p_peer is null or p_peer = uid then
    raise exception 'Invalid peer';
  end if;
  if not exists (select 1 from public.profiles where id = p_peer) then
    raise exception 'Unknown peer';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Create a profile first';
  end if;
  a := least(uid, p_peer);
  b := greatest(uid, p_peer);
  select id into cid from public.conversations
  where participant_a = a and participant_b = b;
  if cid is null then
    insert into public.conversations (participant_a, participant_b)
    values (a, b)
    returning id into cid;
  end if;
  return cid;
end;
$$;

create or replace function public.send_message(p_conversation uuid, p_body text, p_nonce uuid)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_user();
  peer uuid;
  existing public.messages;
  row public.messages;
begin
  if not public.is_conversation_member(p_conversation, uid) then
    raise exception 'Not a conversation member';
  end if;
  peer := public.peer_in_conversation(p_conversation, uid);
  if exists (select 1 from public.profiles where id = peer and is_device)
     and p_body !~ '^[\x20-\x7E]*$' then
    raise exception 'Tomato accepts printable ASCII only';
  end if;

  select * into existing
  from public.messages
  where sender_id = uid and client_nonce = p_nonce;

  if found then
    if existing.body is distinct from p_body or existing.conversation_id is distinct from p_conversation then
      raise exception 'Nonce reused';
    end if;
    return existing;
  end if;

  -- Length is enforced by messages.body check constraint (tests match /check constraint/).
  insert into public.messages (conversation_id, sender_id, body, client_nonce)
  values (p_conversation, uid, p_body, p_nonce)
  returning * into row;
  return row;
end;
$$;

create or replace function public.claim_bridge(p_device uuid, p_instance uuid)
returns public.device_bridges
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_user();
  existing public.device_bridges;
  row public.device_bridges;
begin
  if not exists (
    select 1 from public.profiles where id = p_device and is_device
  ) then
    raise exception 'Unknown device';
  end if;
  if not exists (
    select 1 from envelop_private.bridge_grants
    where device_id = p_device and user_id = uid
  ) then
    raise exception 'Bridge account not provisioned';
  end if;

  select * into existing from public.device_bridges where device_id = p_device;
  if found then
    if existing.expires_at > now() then
      if existing.bridge_user_id = uid and existing.bridge_instance_id = p_instance then
        update public.device_bridges
        set expires_at = now() + interval '30 seconds',
            last_heartbeat = now()
        where device_id = p_device
        returning * into row;
        return row;
      end if;
      raise exception 'Device already leased';
    end if;
    delete from public.device_bridges where device_id = p_device;
  end if;

  insert into public.device_bridges (device_id, bridge_user_id, bridge_instance_id, expires_at, last_heartbeat)
  values (p_device, uid, p_instance, now() + interval '30 seconds', now())
  returning * into row;
  return row;
end;
$$;

create or replace function public.bridge_pending(p_device uuid, p_instance uuid)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_user();
  lease public.device_bridges;
begin
  select * into lease from public.device_bridges
  where device_id = p_device
    and bridge_user_id = uid
    and bridge_instance_id = p_instance
    and expires_at > now();
  if not found then
    raise exception 'lease lost';
  end if;

  return query
  select q.message_id, m.conversation_id, m.sender_id, m.body
  from public.device_queue q
  join public.messages m on m.id = q.message_id
  where q.device_id = p_device
    and q.state = 'queued'
  order by q.created_at asc, q.message_id asc;
end;
$$;

create or replace function public.ack_device_message(p_device uuid, p_instance uuid, p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_user();
  lease public.device_bridges;
begin
  select * into lease from public.device_bridges
  where device_id = p_device
    and bridge_user_id = uid
    and bridge_instance_id = p_instance
    and expires_at > now();
  if not found then
    raise exception 'lease lost';
  end if;

  update public.device_queue
  set state = 'acked',
      acked_at = coalesce(acked_at, now())
  where message_id = p_message
    and device_id = p_device
    and state = 'queued';
end;
$$;

create or replace function public.send_as_device(
  p_device uuid,
  p_instance uuid,
  p_conversation uuid,
  p_body text,
  p_nonce uuid
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_user();
  lease public.device_bridges;
  existing public.messages;
  row public.messages;
begin
  select * into lease from public.device_bridges
  where device_id = p_device
    and bridge_user_id = uid
    and bridge_instance_id = p_instance
    and expires_at > now();
  if not found then
    raise exception 'lease lost';
  end if;
  if not public.is_conversation_member(p_conversation, p_device) then
    raise exception 'Device not a conversation member';
  end if;
  if p_body is null or octet_length(p_body) < 1 or octet_length(p_body) > 256 then
    raise exception 'Body must be 1–256 bytes';
  end if;
  if p_body !~ '^[\x20-\x7E]*$' then
    raise exception 'Tomato accepts printable ASCII only';
  end if;

  select * into existing
  from public.messages
  where sender_id = p_device and client_nonce = p_nonce;
  if found then
    if existing.body is distinct from p_body or existing.conversation_id is distinct from p_conversation then
      raise exception 'Nonce reused';
    end if;
    return existing;
  end if;

  insert into public.messages (conversation_id, sender_id, body, client_nonce)
  values (p_conversation, p_device, p_body, p_nonce)
  returning * into row;
  return row;
end;
$$;

create or replace function public.release_bridge(p_device uuid, p_instance uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_user();
begin
  delete from public.device_bridges
  where device_id = p_device
    and bridge_user_id = uid
    and bridge_instance_id = p_instance;
end;
$$;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.device_queue enable row level security;
alter table public.device_bridges enable row level security;
alter table envelop_private.bridge_grants enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy conversations_select on public.conversations
  for select to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid());

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

create policy device_bridges_select on public.device_bridges
  for select to authenticated using (true);

revoke all on schema public from public;
grant usage on schema public to anon, authenticated;
grant usage on schema envelop_private to postgres;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all tables in schema envelop_private from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.device_bridges to authenticated;
grant select on public.conversation_members to authenticated;

grant execute on function public.create_profile(text, int) to authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
grant execute on function public.claim_bridge(uuid, uuid) to authenticated;
grant execute on function public.bridge_pending(uuid, uuid) to authenticated;
grant execute on function public.ack_device_message(uuid, uuid, uuid) to authenticated;
grant execute on function public.send_as_device(uuid, uuid, uuid, text, uuid) to authenticated;
grant execute on function public.release_bridge(uuid, uuid) to authenticated;

-- RLS policies call is_conversation_member; keep it readable, lock the rest down.
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
revoke all on function public.peer_in_conversation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.require_user() from public, anon, authenticated;
revoke all on function public.active_bridge(uuid) from public, anon, authenticated;
revoke all on function public.queue_device_message() from public, anon, authenticated;
