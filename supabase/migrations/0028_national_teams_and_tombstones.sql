-- Two things the fantasy game got wrong since the UEFA Nations League
-- was promoted to a featured competition.
--
-- 1. A national side is not a club. The pool reads a player's club from
--    the squad lists and the matchday lineups we hold, and the newest
--    evidence wins: after an international break the newest was Denmark
--    or France, not Napoli or Inter, and the player fell out of the pool
--    (and so out of every roster drawn from it). `teams.national` marks
--    the sides to leave out of that reading; the provider says which
--    (teams.national on /teams), and the existing rows are backfilled
--    from the national-team competitions we know.
--
-- 2. An auction or a team deleted on one device came back from another:
--    the other device still held it and wrote it again (an update that
--    matched no row became an insert; an upsert recreated the row).
--    Deleting now leaves a tombstone (`deleted_at`) that every device
--    reads and honours; the nightly prune drops the tombstones after a
--    month.

alter table public.teams add column if not exists national boolean not null default false;

-- Backfill: a side that plays in a national-team competition and in no
-- domestic one. Clubs' international cups (Champions League, Club World
-- Cup, Friendlies Clubs) are deliberately not in the list, and the
-- domestic guard keeps a club out even if a provider id were wrong.
with national_leagues as (
    select id from public.leagues
    where provider_id in (
        -- FIFA: World Cup, its qualifiers, youth and women's editions, Friendlies, FIFA Series, Confederations Cup
        1, 8, 490, 587, 920, 950, 10, 1222, 21, 29, 30, 31, 32, 33, 34, 37, 880, 927,
        -- UEFA: Euro, Nations League, youth and women's editions and qualifiers, Finalissima
        4, 960, 5, 1040, 743, 1083, 886, 893, 850, 38, 921, 493, 1102, 918, 913,
        -- CAF
        6, 36, 922, 538, 973, 953, 1015, 19, 1163,
        -- AFC
        7, 35, 894, 897, 965, 1153, 952, 532, 1012, 1161, 1070, 1101, 803, 1245, 807,
        -- CONMEBOL
        9, 926, 773, 970, 1081, 1085, 1060, 1206,
        -- CONCACAF
        22, 858, 1046, 1057, 536, 808, 963, 912, 537, 1066, 1001, 1028, 1207, 804, 805,
        -- Olympics and games
        480, 524, 881, 882, 1047, 1105, 911, 919, 941, 1045, 1072, 1016, 1237, 951,
        -- Regional cups
        860, 934, 25, 1208, 806, 24, 928, 908, 1189, 1247, 23, 1169, 1188, 28, 859, 771, 1159, 535, 1008, 849, 916, 1038, 766, 902, 904, 900, 914, 1077
    )
),
national_sides as (
    select distinct st.team_id
    from public.season_teams st
    join public.seasons s on s.id = st.season_id
    where s.league_id in (select id from national_leagues)
),
domestic_sides as (
    select distinct st.team_id
    from public.season_teams st
    join public.seasons s on s.id = st.season_id
    join public.leagues l on l.id = s.league_id
    where l.country <> 'World'
)
update public.teams t
set national = true
where t.id in (select team_id from national_sides)
  and t.id not in (select team_id from domestic_sides)
  and not t.national;

-- Tombstones for what a user deletes: the row stays a month so every
-- device of theirs sees it is gone instead of writing it back.
alter table public.fantasy_auctions add column if not exists deleted_at timestamptz;
alter table public.fantasy_teams add column if not exists deleted_at timestamptz;

create index if not exists fantasy_auctions_deleted_at_idx on public.fantasy_auctions (deleted_at) where deleted_at is not null;
create index if not exists fantasy_teams_deleted_at_idx on public.fantasy_teams (deleted_at) where deleted_at is not null;

-- A deleted auction is not shared any more, whatever token it had.
create or replace function public.shared_auction(token uuid)
returns table(name text, league text, config jsonb, purchases jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
    select a.name,
           a.league,
           jsonb_build_object(
               'managers', a.config -> 'managers',
               'credits', a.config -> 'credits',
               'participants', a.config -> 'participants',
               'slots', a.config -> 'slots',
               'mode', a.config -> 'mode'
           ) as config,
           a.purchases,
           a.updated_at
    from public.fantasy_auctions a
    where token is not null and a.share_token = token and a.deleted_at is null
$$;
