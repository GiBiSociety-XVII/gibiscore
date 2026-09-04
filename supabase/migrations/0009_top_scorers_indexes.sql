-- Top scorers and top assists per league season: the queries order by
-- goals/assists, then the other, then minutes, and keep 20 rows. With
-- the full sort key in the index Postgres walks it and stops after 20
-- rows instead of reading every row of the season (rows are wide: the
-- raw provider payload sits in the same table).
create index if not exists player_season_stats_top_goals_idx
    on football.player_season_stats (league_id, season_year, goals desc, assists desc, minutes)
    where goals > 0;

create index if not exists player_season_stats_top_assists_idx
    on football.player_season_stats (league_id, season_year, assists desc, goals desc, minutes)
    where assists > 0;

drop index if exists football.player_season_stats_goals_idx;
