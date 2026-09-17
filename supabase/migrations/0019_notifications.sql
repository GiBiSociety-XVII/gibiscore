-- GiBiScore: push notifications for the matches of a user's favourite
-- competitions and teams (Web Push, sent by the live sync).
--
-- push_subscriptions: one row per browser that said yes (endpoint and
-- keys of the Push API); dropped when the push service says it is gone.
-- notification_settings: the user's switches: everything on or off, and
-- which kinds (kickoff, half_time, full_time, goal, red_card, lineups).
-- muted_fixtures: the single matches the user does not want to hear
-- about (watching it live, no spoilers).
-- notified: what was already sent per fixture, so a second pass of the
-- live job never sends the same goal twice. Service role only.

create table public.push_subscriptions (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    failures smallint not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own_select on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy push_subscriptions_own_insert on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_subscriptions_own_update on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_subscriptions_own_delete on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table public.notification_settings (
    user_id uuid primary key references auth.users(id) on delete cascade,
    enabled boolean not null default true,
    kinds jsonb not null default '{"kickoff": true, "half_time": true, "full_time": true, "goal": true, "red_card": true, "lineups": true}'::jsonb,
    updated_at timestamptz not null default now()
);
create trigger notification_settings_touch_updated_at before update on public.notification_settings
    for each row execute function public.touch_updated_at();
alter table public.notification_settings enable row level security;
create policy notification_settings_own_select on public.notification_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy notification_settings_own_insert on public.notification_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notification_settings_own_update on public.notification_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.notification_settings from anon;
grant select, insert, update on public.notification_settings to authenticated;

create table public.muted_fixtures (
    user_id uuid not null references auth.users(id) on delete cascade,
    fixture_id bigint not null references public.fixtures(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, fixture_id)
);
create index muted_fixtures_fixture_idx on public.muted_fixtures (fixture_id);
alter table public.muted_fixtures enable row level security;
create policy muted_fixtures_own_select on public.muted_fixtures for select to authenticated using ((select auth.uid()) = user_id);
create policy muted_fixtures_own_insert on public.muted_fixtures for insert to authenticated with check ((select auth.uid()) = user_id);
create policy muted_fixtures_own_delete on public.muted_fixtures for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.muted_fixtures from anon;
grant select, insert, delete on public.muted_fixtures to authenticated;

create table public.notified (
    fixture_id bigint not null references public.fixtures(id) on delete cascade,
    key text not null,
    sent_at timestamptz not null default now(),
    primary key (fixture_id, key)
);
alter table public.notified enable row level security;
revoke all on public.notified from anon, authenticated;
