-- The detail of an old match of a basic league (its events, the players'
-- lines, the team statistics, the lineups) is read by nothing: the pages
-- keep calendar, result and standings, which stay. One call clears a
-- bounded number of matches, so a long backlog is spread over days.
create or replace function public.prune_old_detail(cutoff_year int, max_fixtures int)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    ids bigint[];
begin
    select array_agg(id) into ids from (
        select f.id
        from public.fixtures f
        join public.seasons s on s.id = f.season_id
        join public.leagues l on l.id = s.league_id
        where l.tier = 'basic'
          and s.year < cutoff_year
          and (exists (select 1 from public.lineups x where x.fixture_id = f.id)
            or exists (select 1 from public.fixture_player_stats x where x.fixture_id = f.id)
            or exists (select 1 from public.fixture_events x where x.fixture_id = f.id)
            or exists (select 1 from public.fixture_team_stats x where x.fixture_id = f.id))
        order by f.starting_at
        limit max_fixtures
    ) t;
    if ids is null then
        return 0;
    end if;
    delete from public.fixture_player_stats where fixture_id = any(ids);
    delete from public.fixture_events where fixture_id = any(ids);
    delete from public.fixture_team_stats where fixture_id = any(ids);
    delete from public.lineups where fixture_id = any(ids);
    return coalesce(array_length(ids, 1), 0);
end;
$$;
-- Not enough on its own (see 0025): a new function is granted to PUBLIC.
revoke all on function public.prune_old_detail(int, int) from anon, authenticated;
