-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)
-- for your project. Safe to re-run any time you pull in a newer version of
-- this file (e.g. after a new table is added) -- every statement is
-- idempotent: tables use `create table if not exists`, and policies are
-- dropped and recreated rather than just `create policy`, since Postgres
-- has no `create policy if not exists`.
--
-- Row-level security policies only decide *which rows* a role can see once
-- it already has base access to the table -- they don't grant that base
-- access themselves. Without the `grant` statements below, every query
-- from the app (running as the `authenticated` role) fails outright with
-- "permission denied for table ..." before RLS is ever evaluated, even
-- though every policy is correct. Re-running this file adds the missing
-- grants if your project doesn't already have them.
grant usage on schema public to authenticated;

create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

alter table public.watchlist enable row level security;
grant select, insert, delete on public.watchlist to authenticated;

drop policy if exists "Users can view their own watchlist" on public.watchlist;
create policy "Users can view their own watchlist"
  on public.watchlist for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add to their own watchlist" on public.watchlist;
create policy "Users can add to their own watchlist"
  on public.watchlist for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove from their own watchlist" on public.watchlist;
create policy "Users can remove from their own watchlist"
  on public.watchlist for delete
  using (auth.uid() = user_id);

-- Custom price/moving-average/volume alerts. `id` is client-generated (see
-- src/lib/alerts-client.ts) so local-mode and Supabase-mode alerts use the
-- same id scheme. `rule` holds the full AlertRule JSON (kind, thresholds,
-- lastFiredAt, ...); `symbol` is duplicated out as a plain column in case
-- you want to index/filter by it later.
create table if not exists public.alerts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  rule jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.alerts enable row level security;
grant select, insert, update, delete on public.alerts to authenticated;

drop policy if exists "Users can view their own alerts" on public.alerts;
create policy "Users can view their own alerts"
  on public.alerts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own alerts" on public.alerts;
create policy "Users can create their own alerts"
  on public.alerts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own alerts" on public.alerts;
create policy "Users can update their own alerts"
  on public.alerts for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own alerts" on public.alerts;
create policy "Users can delete their own alerts"
  on public.alerts for delete
  using (auth.uid() = user_id);

-- Chart trend lines, scoped per symbol + candle timeframe (a line drawn on
-- a 1-day chart isn't meaningful on a 1-minute chart, so they're stored
-- separately). `line` holds the full TrendLine JSON (endpoints + price).
create table if not exists public.drawings (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  timeframe text not null,
  line jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.drawings enable row level security;
grant select, insert, delete on public.drawings to authenticated;

drop policy if exists "Users can view their own drawings" on public.drawings;
create policy "Users can view their own drawings"
  on public.drawings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own drawings" on public.drawings;
create policy "Users can create their own drawings"
  on public.drawings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own drawings" on public.drawings;
create policy "Users can delete their own drawings"
  on public.drawings for delete
  using (auth.uid() = user_id);

-- Web Push subscriptions (one row per browser/device the user enabled
-- notifications on). Read by the scheduled Netlify function
-- (netlify/functions/check-alerts) using the service_role key, which
-- bypasses RLS -- that's expected, since that job checks every user's
-- alerts on a timer with no logged-in session to scope to.
create table if not exists public.push_subscriptions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
grant select, insert, delete on public.push_subscriptions to authenticated;

drop policy if exists "Users can view their own push subscriptions" on public.push_subscriptions;
create policy "Users can view their own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own push subscriptions" on public.push_subscriptions;
create policy "Users can add their own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own push subscriptions" on public.push_subscriptions;
create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
