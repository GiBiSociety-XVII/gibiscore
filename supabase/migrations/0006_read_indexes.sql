-- GiBiScore: indexes for the read paths of the scores UI (day lists, live
-- list, standings, team pages, season rankings).
create index if not exists fixtures_starting_at_idx on football.fixtures(starting_at);
create index if not exists fixtures_live_idx on football.fixtures(state) where state in ('live','half_time','extra_time','penalties');
create index if not exists fixtures_season_starting_idx on football.fixtures(season_id, starting_at);
create index if not exists fixtures_home_team_idx on football.fixtures(home_team_id, starting_at);
create index if not exists fixtures_away_team_idx on football.fixtures(away_team_id, starting_at);
create index if not exists standings_season_idx on football.standings(season_id, "group", position);
create index if not exists standings_team_idx on football.standings(team_id);
create index if not exists squad_members_team_idx on football.squad_members(team_id);
create index if not exists squad_members_player_idx on football.squad_members(player_id);
create index if not exists sidelined_team_idx on football.sidelined(team_id);
create index if not exists leagues_slug_idx on football.leagues(slug);
create index if not exists teams_slug_idx on football.teams(slug);
create index if not exists players_slug_idx on football.players(slug);
