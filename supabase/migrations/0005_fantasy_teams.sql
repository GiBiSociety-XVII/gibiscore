-- GiBiScore: a signed-in user's fantasy teams, for the lineup page on every device.
--
-- One row per team (the id the device uses: league name and team name):
-- the roster with the league's settings, the starters pinned by hand, the
-- players marked out, and the lineup frozen at the round's kick-off.
-- Users read and write their own rows only.

create table public.fantasy_teams (
    user_id     uuid not null references auth.users(id) on delete cascade,
    id          text not null,
    team        jsonb not null,
    pins        jsonb not null default '[]'::jsonb,
    outs        jsonb not null default '[]'::jsonb,
    lock        jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    primary key (user_id, id)
);

create trigger fantasy_teams_touch_updated_at before update on public.fantasy_teams
    for each row execute function public.touch_updated_at();

alter table public.fantasy_teams enable row level security;
create policy fantasy_teams_select on public.fantasy_teams for select to authenticated using ((select auth.uid()) = user_id);
create policy fantasy_teams_insert on public.fantasy_teams for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fantasy_teams_update on public.fantasy_teams for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy fantasy_teams_delete on public.fantasy_teams for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.fantasy_teams from anon;
grant select, insert, update, delete on public.fantasy_teams to authenticated;
