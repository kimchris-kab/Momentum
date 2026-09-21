-- Momentum cloud backup — run this once in your project's SQL editor.
--
-- One row per account holding the same JSON the export button produces. Row-level security
-- is what keeps one account's data away from another's; the anon key in the app is public by
-- design and grants nothing on its own.

create table if not exists public.backups (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  data           jsonb       not null,
  schema_version integer,
  device         text,
  size_bytes     integer,
  -- How many things the backup holds, so another device can tell whether a push would
  -- shrink it without pulling the whole row down first.
  item_count     integer,
  updated_at     timestamptz not null default now()
);

alter table public.backups enable row level security;

-- Three policies, all saying the same thing: you can only touch your own row. `using`
-- governs which rows are visible to read, update and delete; `with check` governs what a
-- row is allowed to become, which is what stops anyone writing a row under someone else's id.
drop policy if exists "read own backup"   on public.backups;
drop policy if exists "insert own backup" on public.backups;
drop policy if exists "update own backup" on public.backups;
drop policy if exists "delete own backup" on public.backups;

create policy "read own backup"   on public.backups for select using (auth.uid() = user_id);
create policy "insert own backup" on public.backups for insert with check (auth.uid() = user_id);
create policy "update own backup" on public.backups for update using (auth.uid() = user_id)
                                                              with check (auth.uid() = user_id);
create policy "delete own backup" on public.backups for delete using (auth.uid() = user_id);

-- A ceiling, so a runaway client can't fill the project's disk with one enormous row. Two
-- megabytes is far beyond a few years of ordinary use.
alter table public.backups drop constraint if exists backups_size_sane;
alter table public.backups add constraint backups_size_sane
  check (size_bytes is null or size_bytes <= 2 * 1024 * 1024);

-- updated_at is sent by the client, but a trigger means a stale or absent clock on a phone
-- can't make a backup look older or newer than it is.
create or replace function public.touch_backup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists backups_touch on public.backups;
create trigger backups_touch before insert or update on public.backups
  for each row execute function public.touch_backup();
