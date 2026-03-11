# Supabase setup (login + live leaderboard) + Vercel deploy

This TurboWarp Packager export is a static site. For login + a live leaderboard, it uses **Supabase Auth (Google)** + a **Postgres table** (optionally with Realtime).

## 1) Create a Supabase project

- Create a project at Supabase.
- In **Project Settings → API**, copy:
  - **Project URL**
  - **anon public** key
- Paste them into `supabase-config.js`.

## 2) Enable Google login

- **Authentication → Providers → Google** → enable
- Add your redirect URLs:
  - Local testing: `http://localhost:8080`
  - Vercel: `https://YOUR-PROJECT.vercel.app`

## 3) Create the leaderboard table

Run this in **SQL Editor**:

```sql
create table if not exists public.leaderboard (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  best_attempts integer not null,
  best_time_ms integer not null,
  email_domain text,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;
```

## 4) Row Level Security (RLS) policies

Run:

```sql
-- Anyone signed in can read the leaderboard
create policy "leaderboard_read"
on public.leaderboard
for select
to authenticated
using (true);

-- A user can insert their own row
create policy "leaderboard_insert_own"
on public.leaderboard
for insert
to authenticated
with check (auth.uid() = id);

-- A user can update their own row
create policy "leaderboard_update_own"
on public.leaderboard
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
```

If you still see 401/403 errors, ensure the `authenticated` role has table privileges:

```sql
grant select, insert, update on table public.leaderboard to authenticated;
```

Optional (recommended) constraints:

```sql
alter table public.leaderboard
  add constraint best_attempts_range check (best_attempts between 1 and 999),
  add constraint best_time_ms_range check (best_time_ms between 0 and 86400000),
  add constraint username_len check (char_length(username) between 1 and 50);
```

## 5) (Optional) Enable Realtime for instant updates

The client subscribes to Postgres changes for `public.leaderboard`, but also polls every ~15s as a fallback.

- **Database → Replication** (or **Realtime** settings depending on UI)
  - Enable Realtime / replication for `public.leaderboard`.

## 6) Deploy to Vercel

This repo is already static. On Vercel:

- New Project → import your repo/folder
- Framework: “Other”
- Build command: none
- Output: the project root (same folder as `index.html`)

After deploying, add the Vercel URL in Supabase **Authentication → URL Configuration / Redirect URLs** (wording varies).

## Vercel env vars

This project reads Supabase settings from `/api/config` (a Vercel Serverless Function), so you can keep config out of GitHub.

Set these in Vercel → Project → Settings → Environment Variables:

- `SUPABASE_URL` (Supabase Project URL)
- `SUPABASE_ANON_KEY` (Supabase anon public key)
- `ALLOWED_EMAIL_DOMAIN` (optional, e.g. `myschool.edu`)
