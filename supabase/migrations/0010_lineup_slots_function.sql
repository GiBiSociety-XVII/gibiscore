-- Starting slots per player, team, season and formation: what the
-- auction reads to derive fantasy roles and who competes for a spot.
create or replace function football.lineup_slots(p_season_ids bigint[])
returns table (player_id bigint, team_id bigint, season_id bigint, formation text, formation_position smallint, starts bigint)
language sql stable as $$
    select l.player_id, l.team_id, f.season_id, l.formation, l.formation_position, count(*)::bigint as starts
    from football.lineups l
    join football.fixtures f on f.id = l.fixture_id
    where f.season_id = any(p_season_ids) and not l.is_expected and l.is_starter and l.formation_position is not null
    group by 1, 2, 3, 4, 5
$$;
