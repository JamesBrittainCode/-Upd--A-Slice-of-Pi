-- Supabase schema for "A Slice of Pi" leaderboard
-- Run in Supabase SQL Editor.

begin;

create table if not exists public.leaderboard (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  best_attempts integer not null,
  best_time_ms integer not null,
  email_domain text,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'best_attempts_range'
      and conrelid = 'public.leaderboard'::regclass
  ) then
    alter table public.leaderboard
      add constraint best_attempts_range check (best_attempts between 1 and 999);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'best_time_ms_range'
      and conrelid = 'public.leaderboard'::regclass
  ) then
    alter table public.leaderboard
      add constraint best_time_ms_range check (best_time_ms between 0 and 86400000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'username_len'
      and conrelid = 'public.leaderboard'::regclass
  ) then
    alter table public.leaderboard
      add constraint username_len check (char_length(username) between 1 and 50);
  end if;
end $$;

-- Policies (idempotent: drop if exists then create)
drop policy if exists leaderboard_read on public.leaderboard;
create policy "leaderboard_read"
on public.leaderboard
for select
to authenticated
using (true);

drop policy if exists leaderboard_insert_own on public.leaderboard;
create policy "leaderboard_insert_own"
on public.leaderboard
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists leaderboard_update_own on public.leaderboard;
create policy "leaderboard_update_own"
on public.leaderboard
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

grant select, insert, update on table public.leaderboard to authenticated;

commit;

