-- Starts and benches per player, team and season: who is a fixed starter
-- when available and who is not.
create or replace function football.lineup_bench(p_season_ids bigint[])
returns table (player_id bigint, team_id bigint, season_id bigint, starts bigint, benches bigint)
language sql stable as $$
    select l.player_id, l.team_id, f.season_id,
        count(*) filter (where l.is_starter)::bigint as starts,
        count(*) filter (where not l.is_starter)::bigint as benches
    from football.lineups l
    join football.fixtures f on f.id = l.fixture_id
    where f.season_id = any(p_season_ids) and not l.is_expected
    group by 1, 2, 3
$$;

-- Who started in a player's usual slots of the formation in the matches
-- he sat on the bench: the concrete rivals for his place.
create or replace function football.lineup_replacements(p_season_ids bigint[])
returns table (player_id bigint, team_id bigint, season_id bigint, starter_id bigint, matches bigint)
language sql stable as $$
    with starts as (
        select l.fixture_id, l.team_id, l.player_id, l.formation_position as slot, f.season_id
        from football.lineups l join football.fixtures f on f.id = l.fixture_id
        where f.season_id = any(p_season_ids) and not l.is_expected and l.is_starter and l.formation_position is not null
    ),
    benched as (
        select l.fixture_id, l.team_id, l.player_id, f.season_id
        from football.lineups l join football.fixtures f on f.id = l.fixture_id
        where f.season_id = any(p_season_ids) and not l.is_expected and not l.is_starter
    ),
    own as (select player_id, team_id, slot from starts group by 1, 2, 3)
    select b.player_id, b.team_id, b.season_id, s.player_id as starter_id, count(distinct b.fixture_id)::bigint as matches
    from benched b
    join own o on o.player_id = b.player_id and o.team_id = b.team_id
    join starts s on s.fixture_id = b.fixture_id and s.team_id = b.team_id and s.slot = o.slot
    group by 1, 2, 3, 4
$$;
