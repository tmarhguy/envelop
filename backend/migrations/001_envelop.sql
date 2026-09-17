-- Envelop clean BLE-only schema.
-- WARNING: this intentionally deletes all Envelop profiles, chats, jobs, and
-- leases. Run this one file in Supabase, then open the private Android app
-- before any public client so it becomes the owner.

begin;

drop schema if exists envelop_private cascade;
drop schema if exists public cascade;
create schema public;
create schema envelop_private;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
grant usage on schema envelop_private to postgres, service_role;
grant all on schema envelop_private to postgres, service_role;

create table public.profiles (
  id uuid primary key,
  handle text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_id int not null check (avatar_id between 0 and 15),
  is_device boolean not null default false,
  verified boolean not null default false,
  pinned boolean not null default false,
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

create table envelop_private.admins (
  user_id uuid primary key references public.profiles(id) on delete cascade
);

create table envelop_private.trusted_bridge_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  trusted_at timestamptz not null default now(),
  trusted_by uuid
);

create table public.presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now()
);

create table public.compute_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.profiles(id),
  conversation_id uuid not null references public.conversations(id),
  requester uuid not null references public.profiles(id),
  job_hex text not null check (
    char_length(job_hex) between 1 and 2048
    and job_hex ~ '^[0-9A-Fa-f ]+$'
  ),
  status text not null default 'queued' check (
    status in ('queued', 'claimed', 'completed', 'failed', 'cancelled')
  ),
  result_text text check (
    result_text is null or octet_length(result_text) between 1 and 256
  ),
  bridge_instance_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table envelop_private.reserved_names (
  name text primary key
);

insert into envelop_private.reserved_names(name) values ('tyrone marhguy');

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

create or replace function envelop_private.normalize_name(p_name text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(trim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g')));
$$;

create or replace function envelop_private.forbid_reserved_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from envelop_private.reserved_names reserved
    where envelop_private.normalize_name(reserved.name)
      = envelop_private.normalize_name(new.display_name)
  ) and not coalesce(new.verified, false) then
    raise exception 'That name is reserved.';
  end if;
  return new;
end;
$$;

create trigger profiles_reserved_name
  before insert or update of display_name, verified on public.profiles
  for each row execute function envelop_private.forbid_reserved_name();

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

create or replace function public.update_profile_name(p_name text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_user();
  cleaned text := trim(p_name);
  result public.profiles;
begin
  if cleaned is null or char_length(cleaned) < 1 or char_length(cleaned) > 32 then
    raise exception 'Name must be 1–32 characters';
  end if;
  update public.profiles
  set display_name = cleaned
  where id = uid and not is_device
  returning * into result;
  if not found then
    raise exception 'Human profile required';
  end if;
  return result;
end;
$$;

-- Dashboard-only owner bootstrap. The private app first creates an ordinary
-- anonymous profile, then the operator supplies that profile UUID here.
create or replace function envelop_private.bootstrap_owner(p_user uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid;
  result public.profiles;
begin
  lock table envelop_private.admins in exclusive mode;

  select user_id into current_owner
  from envelop_private.admins
  order by user_id
  limit 1;

  if current_owner is not null and current_owner <> p_user then
    raise exception 'Private owner already initialized';
  end if;
  if p_user is null then
    raise exception 'Profile UUID required';
  end if;

  update public.profiles
  set display_name = 'Tyrone Marhguy',
      verified = true,
      pinned = true
  where id = p_user and not is_device
  returning * into result;
  if not found then
    raise exception 'Human profile not found';
  end if;

  delete from envelop_private.admins where user_id <> p_user;
  insert into envelop_private.admins(user_id)
  values (p_user)
  on conflict (user_id) do nothing;

  insert into envelop_private.trusted_bridge_users(user_id, trusted_by)
  values (p_user, p_user)
  on conflict (user_id) do nothing;

  insert into envelop_private.bridge_grants(device_id, user_id)
  values ('00000000-0000-0000-0000-000000000001', p_user)
  on conflict (device_id, user_id) do nothing;

  return result;
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

create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from envelop_private.admins where user_id = auth.uid()
  );
$$;

create or replace function public.admin_set_verified(p_user uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from envelop_private.admins where user_id = auth.uid()
  ) then
    raise exception 'Admin required';
  end if;
  update public.profiles
  set verified = p_verified
  where id = p_user and not is_device;
  if not found then
    raise exception 'Invalid profile';
  end if;
end;
$$;

create or replace function public.owner_trusted_bridge_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from envelop_private.admins where user_id = auth.uid()
  ) then
    raise exception 'Admin required';
  end if;
  return query
  select trusted.user_id
  from envelop_private.trusted_bridge_users trusted
  order by trusted.user_id;
end;
$$;

create or replace function public.owner_set_trusted_bridge(
  p_user uuid,
  p_trusted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not exists (
    select 1 from envelop_private.admins where user_id = uid
  ) then
    raise exception 'Admin required';
  end if;
  if p_user is null or p_trusted is null or not exists (
    select 1 from public.profiles where id = p_user and not is_device
  ) then
    raise exception 'Invalid profile';
  end if;

  if p_trusted then
    insert into envelop_private.trusted_bridge_users(user_id, trusted_by)
    values (p_user, uid)
    on conflict (user_id) do update
    set trusted_at = now(), trusted_by = uid;
    insert into envelop_private.bridge_grants(device_id, user_id)
    values ('00000000-0000-0000-0000-000000000001', p_user)
    on conflict (device_id, user_id) do nothing;
  else
    delete from public.device_bridges where bridge_user_id = p_user;
    delete from envelop_private.bridge_grants where user_id = p_user;
    delete from envelop_private.trusted_bridge_users where user_id = p_user;
  end if;
end;
$$;

create or replace function public.admin_remove_profile(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not exists (
    select 1 from envelop_private.admins where user_id = uid
  ) then
    raise exception 'Admin required';
  end if;
  if p_user is null or p_user = uid or exists (
    select 1 from public.profiles where id = p_user and is_device
  ) then
    raise exception 'Invalid profile';
  end if;

  delete from public.compute_jobs
  where requester = p_user or conversation_id in (
    select id from public.conversations
    where participant_a = p_user or participant_b = p_user
  );
  delete from public.device_queue where message_id in (
    select messages.id
    from public.messages messages
    join public.conversations conversations
      on conversations.id = messages.conversation_id
    where conversations.participant_a = p_user
       or conversations.participant_b = p_user
  );
  delete from public.messages where conversation_id in (
    select id from public.conversations
    where participant_a = p_user or participant_b = p_user
  );
  delete from public.conversations
  where participant_a = p_user or participant_b = p_user;
  delete from public.device_bridges where bridge_user_id = p_user;
  delete from envelop_private.bridge_grants where user_id = p_user;
  delete from envelop_private.trusted_bridge_users where user_id = p_user;
  delete from envelop_private.admins where user_id = p_user;
  delete from public.profiles where id = p_user and not is_device;
end;
$$;

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
  if exists (
    select 1 from envelop_private.admins where user_id = uid
  ) then
    raise exception 'Owner cannot leave the private network';
  end if;
  delete from public.compute_jobs
  where requester = uid or conversation_id in (
    select id from public.conversations
    where participant_a = uid or participant_b = uid
  );
  delete from public.device_queue where message_id in (
    select messages.id
    from public.messages messages
    join public.conversations conversations
      on conversations.id = messages.conversation_id
    where conversations.participant_a = uid
       or conversations.participant_b = uid
  );
  delete from public.messages where conversation_id in (
    select id from public.conversations
    where participant_a = uid or participant_b = uid
  );
  delete from public.conversations
  where participant_a = uid or participant_b = uid;
  delete from public.device_bridges where bridge_user_id = uid;
  delete from envelop_private.bridge_grants where user_id = uid;
  delete from envelop_private.trusted_bridge_users where user_id = uid;
  delete from public.profiles where id = uid and not is_device;
end;
$$;

create or replace function public.admin_flush()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not exists (
    select 1 from envelop_private.admins where user_id = uid
  ) then
    raise exception 'Admin required';
  end if;

  insert into envelop_private.trusted_bridge_users(user_id, trusted_by)
  values (uid, uid)
  on conflict (user_id) do nothing;

  delete from public.compute_jobs;
  delete from public.device_queue;
  delete from public.messages;
  delete from public.conversations;
  delete from public.device_bridges;
  delete from public.presence where user_id <> uid;
  delete from envelop_private.admins where user_id <> uid;
  delete from public.profiles profile
  where not profile.is_device
    and profile.id <> uid
    and not exists (
      select 1
      from envelop_private.trusted_bridge_users trusted
      where trusted.user_id = profile.id
    );

  delete from envelop_private.bridge_grants;
  insert into envelop_private.bridge_grants(device_id, user_id)
  select
    '00000000-0000-0000-0000-000000000001'::uuid,
    trusted.user_id
  from envelop_private.trusted_bridge_users trusted
  join public.profiles profile
    on profile.id = trusted.user_id and not profile.is_device;
end;
$$;

create or replace function public.enqueue_compute_job(
  p_device uuid,
  p_conversation uuid,
  p_job_hex text
)
returns public.compute_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_user();
  peer uuid;
  result public.compute_jobs;
begin
  if not exists (
    select 1 from public.profiles where id = p_device and is_device
  ) then
    raise exception 'Unknown device';
  end if;
  select case
    when conversation.participant_a = uid then conversation.participant_b
    when conversation.participant_b = uid then conversation.participant_a
    else null
  end into peer
  from public.conversations conversation
  where conversation.id = p_conversation;
  if peer is null then
    raise exception 'Not a conversation member';
  end if;
  if peer is distinct from p_device then
    raise exception 'Compute runs in the Tomato conversation';
  end if;
  if p_job_hex is null
     or char_length(p_job_hex) < 1
     or char_length(p_job_hex) > 2048
     or p_job_hex !~ '^[0-9A-Fa-f ]+$' then
    raise exception 'Job must be 1–2048 hex characters';
  end if;

  insert into public.compute_jobs(
    device_id, conversation_id, requester, job_hex
  ) values (
    p_device, p_conversation, uid, p_job_hex
  )
  returning * into result;
  return result;
end;
$$;

create or replace function public.bridge_compute_pending(
  p_device uuid,
  p_instance uuid
)
returns table (
  job_id uuid,
  conversation_id uuid,
  requester uuid,
  job_hex text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_user();
begin
  if not exists (
    select 1
    from public.device_bridges
    where device_id = p_device
      and bridge_user_id = uid
      and bridge_instance_id = p_instance
      and expires_at > now()
  ) then
    raise exception 'lease lost';
  end if;

  return query
  select job.id, job.conversation_id, job.requester, job.job_hex
  from public.compute_jobs job
  where job.device_id = p_device
    and job.status = 'queued'
  order by job.created_at, job.id
  limit 8;
end;
$$;

create or replace function public.bridge_claim_compute_job(
  p_job uuid,
  p_device uuid,
  p_instance uuid
)
returns public.compute_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_user();
  result public.compute_jobs;
begin
  if not exists (
    select 1
    from public.device_bridges
    where device_id = p_device
      and bridge_user_id = uid
      and bridge_instance_id = p_instance
      and expires_at > now()
  ) then
    raise exception 'lease lost';
  end if;

  update public.compute_jobs
  set status = 'claimed',
      bridge_instance_id = p_instance,
      updated_at = now()
  where id = p_job
    and device_id = p_device
    and status = 'queued'
  returning * into result;
  if not found then
    raise exception 'job unavailable';
  end if;
  return result;
end;
$$;

create or replace function public.bridge_finish_compute_job(
  p_job uuid,
  p_device uuid,
  p_instance uuid,
  p_result_text text,
  p_error text
)
returns public.compute_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_user();
  result public.compute_jobs;
begin
  if not exists (
    select 1
    from public.device_bridges
    where device_id = p_device
      and bridge_user_id = uid
      and bridge_instance_id = p_instance
      and expires_at > now()
  ) then
    raise exception 'lease lost';
  end if;

  if p_error is not null then
    update public.compute_jobs
    set status = 'failed',
        result_text = left(p_error, 256),
        updated_at = now()
    where id = p_job
      and device_id = p_device
      and status = 'claimed'
      and bridge_instance_id = p_instance
    returning * into result;
  else
    if p_result_text is null
       or octet_length(p_result_text) < 1
       or octet_length(p_result_text) > 256 then
      raise exception 'Result must be 1–256 bytes';
    end if;
    update public.compute_jobs
    set status = 'completed',
        result_text = p_result_text,
        updated_at = now()
    where id = p_job
      and device_id = p_device
      and status = 'claimed'
      and bridge_instance_id = p_instance
    returning * into result;
  end if;
  if not found then
    raise exception 'job unavailable';
  end if;
  return result;
end;
$$;

create or replace function public.my_compute_job(p_job uuid)
returns public.compute_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_user();
  result public.compute_jobs;
begin
  select * into result
  from public.compute_jobs
  where id = p_job and requester = uid;
  if not found then
    raise exception 'Unknown job';
  end if;
  return result;
end;
$$;

create or replace function public.cancel_compute_job(p_job uuid)
returns public.compute_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_user();
  result public.compute_jobs;
begin
  update public.compute_jobs
  set status = 'cancelled',
      updated_at = now()
  where id = p_job
    and requester = uid
    and status = 'queued'
  returning * into result;
  if found then
    return result;
  end if;
  select * into result
  from public.compute_jobs
  where id = p_job and requester = uid;
  if not found then
    raise exception 'Unknown job';
  end if;
  return result;
end;
$$;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.device_queue enable row level security;
alter table public.device_bridges enable row level security;
alter table public.presence enable row level security;
alter table public.compute_jobs enable row level security;
alter table envelop_private.bridge_grants enable row level security;
alter table envelop_private.admins enable row level security;
alter table envelop_private.trusted_bridge_users enable row level security;
alter table envelop_private.reserved_names enable row level security;

alter table envelop_private.bridge_grants force row level security;
alter table envelop_private.admins force row level security;
alter table envelop_private.trusted_bridge_users force row level security;
alter table envelop_private.reserved_names force row level security;

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

create policy presence_select on public.presence
  for select to authenticated using (true);

revoke all on schema public from public;
grant usage on schema public to anon, authenticated;
grant usage on schema envelop_private to postgres;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all tables in schema envelop_private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema envelop_private from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.device_bridges to authenticated;
grant select on public.presence to authenticated;
grant select on public.conversation_members to authenticated;

grant execute on function public.create_profile(text, int) to authenticated;
grant execute on function public.update_profile_name(text) to authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
grant execute on function public.claim_bridge(uuid, uuid) to authenticated;
grant execute on function public.bridge_pending(uuid, uuid) to authenticated;
grant execute on function public.ack_device_message(uuid, uuid, uuid) to authenticated;
grant execute on function public.send_as_device(uuid, uuid, uuid, text, uuid) to authenticated;
grant execute on function public.release_bridge(uuid, uuid) to authenticated;
grant execute on function public.heartbeat() to authenticated;
grant execute on function public.leave_network() to authenticated;
grant execute on function public.am_i_admin() to authenticated;
grant execute on function public.admin_set_verified(uuid, boolean) to authenticated;
grant execute on function public.admin_remove_profile(uuid) to authenticated;
grant execute on function public.admin_flush() to authenticated;
grant execute on function public.owner_trusted_bridge_ids() to authenticated;
grant execute on function public.owner_set_trusted_bridge(uuid, boolean) to authenticated;
grant execute on function public.enqueue_compute_job(uuid, uuid, text) to authenticated;
grant execute on function public.bridge_compute_pending(uuid, uuid) to authenticated;
grant execute on function public.bridge_claim_compute_job(uuid, uuid, uuid) to authenticated;
grant execute on function public.bridge_finish_compute_job(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.my_compute_job(uuid) to authenticated;
grant execute on function public.cancel_compute_job(uuid) to authenticated;

-- RLS policies call is_conversation_member; keep it readable, lock the rest down.
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

commit;
