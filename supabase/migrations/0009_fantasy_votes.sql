-- GiBiScore: the votes users type in for the players of a round.
--
-- The newspaper vote (not the fantasy score) and the events the game
-- pays, one row per user, season, round and player; a null vote is a
-- typed "no vote". Users read and write their own rows; the matchday
-- context reads everyone's through fantasy_round_votes, which returns
-- the latest row typed for a player and round without saying by whom.

create table public.fantasy_votes (
    user_id          uuid not null references auth.users(id) on delete cascade,
    season_id        bigint not null references public.seasons(id) on delete cascade,
    round            text not null,
    player_id        bigint not null references public.players(id) on delete cascade,
    team_id          bigint not null references public.teams(id),
    voto             numeric(4,2) check (voto is null or (voto >= 1 and voto <= 10)),
    goals            smallint not null default 0,
    assists          smallint not null default 0,
    yellow           smallint not null default 0,
    red              smallint not null default 0,
    conceded         smallint not null default 0,
    penalties_saved  smallint not null default 0,
    penalties_missed smallint not null default 0,
    own_goals        smallint not null default 0,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    primary key (user_id, season_id, round, player_id)
);
create index fantasy_votes_season_idx on public.fantasy_votes(season_id, round, player_id);

create trigger fantasy_votes_touch_updated_at before update on public.fantasy_votes
    for each row execute function public.touch_updated_at();

alter table public.fantasy_votes enable row level security;
create policy fantasy_votes_select on public.fantasy_votes for select to authenticated using ((select auth.uid()) = user_id);
create policy fantasy_votes_insert on public.fantasy_votes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fantasy_votes_update on public.fantasy_votes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy fantasy_votes_delete on public.fantasy_votes for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.fantasy_votes from anon;
grant select, insert, update, delete on public.fantasy_votes to authenticated;

-- Everyone's votes of a season, the latest typed per player and round, for the matchday context (read with the anon key).
create or replace function public.fantasy_round_votes(p_season bigint)
returns table (round text, player_id bigint, team_id bigint, voto numeric, goals smallint, assists smallint, yellow smallint, red smallint, conceded smallint, penalties_saved smallint, penalties_missed smallint, own_goals smallint, updated_at timestamptz)
language sql stable security definer
set search_path = public
as $$
    select distinct on (v.round, v.player_id)
        v.round, v.player_id, v.team_id, v.voto, v.goals, v.assists, v.yellow, v.red, v.conceded, v.penalties_saved, v.penalties_missed, v.own_goals, v.updated_at
    from public.fantasy_votes v
    where v.season_id = p_season
    order by v.round, v.player_id, v.updated_at desc;
$$;
revoke all on function public.fantasy_round_votes(bigint) from public;
grant execute on function public.fantasy_round_votes(bigint) to anon, authenticated;
