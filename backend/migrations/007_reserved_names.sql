-- 007: reserved display names. Some names may only be held by
-- verified profiles (the tick is admin-granted), so nobody can squat
-- or impersonate them — not on create, not on rename.
-- Self-contained and re-runnable: run this whole file once in the
-- Supabase SQL editor (after 006). Add future names with:
--   insert into envelop_private.reserved_names(name)
--   values ('another name') on conflict do nothing;
-- Names match case- and space-insensitively after trimming.

create table if not exists envelop_private.reserved_names (
  name text primary key
);

insert into envelop_private.reserved_names(name)
values ('tyrone marhguy')
on conflict do nothing;

create or replace function envelop_private.forbid_reserved_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from envelop_private.reserved_names
             where name = lower(trim(NEW.display_name)))
     and coalesce(NEW.verified, false) = false then
    raise exception 'That name is reserved.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_reserved_name on public.profiles;
create trigger profiles_reserved_name
  before insert or update of display_name on public.profiles
  for each row execute function envelop_private.forbid_reserved_name();
