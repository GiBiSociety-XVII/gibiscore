-- Public reads (anon) were killed after 3 seconds, the Supabase default: on a busy evening the scores
-- list, a match page or the fantasy pool build took longer and pages fell back to "not found" or
-- "unavailable". The site's queries are bounded by pagination; give them time.
alter role anon set statement_timeout = '15s';
alter role authenticated set statement_timeout = '20s';
notify pgrst, 'reload config';

-- Foreign keys without a covering index, as the performance linter reported: the match page joins
-- events, lineups and statistics by team, the study reads player statistics by season.
create index if not exists fixture_events_team_idx on public.fixture_events(team_id);
create index if not exists fixture_events_related_player_idx on public.fixture_events(related_player_id);
create index if not exists fixture_player_stats_team_idx on public.fixture_player_stats(team_id);
create index if not exists fixture_team_stats_team_idx on public.fixture_team_stats(team_id);
create index if not exists lineups_team_idx on public.lineups(team_id);
create index if not exists player_season_stats_season_idx on public.player_season_stats(season_id);
create index if not exists sidelined_fixture_idx on public.sidelined(fixture_id);
create index if not exists player_season_raw_league_idx on public.player_season_raw(league_id);
create index if not exists player_season_raw_team_idx on public.player_season_raw(team_id);
