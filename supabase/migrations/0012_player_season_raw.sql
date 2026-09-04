-- The provider's full statistics payload leaves player_season_stats:
-- it was 61 MB of the table's 92, read by nobody, and made every scan
-- of the season statistics (rankings, auction list, player pages) pay
-- for it. It lives in its own table now, same natural key.
create table if not exists football.player_season_raw (
    player_id    bigint not null references football.players(id),
    team_id      bigint not null references football.teams(id),
    league_id    bigint not null references football.leagues(id),
    season_year  integer not null,
    raw          jsonb not null,
    synced_at    timestamptz not null default now(),
    primary key (player_id, team_id, league_id, season_year)
);

insert into football.player_season_raw (player_id, team_id, league_id, season_year, raw, synced_at)
select player_id, team_id, league_id, season_year, raw, coalesce(synced_at, now())
from football.player_season_stats
where raw is not null
on conflict (player_id, team_id, league_id, season_year) do update set raw = excluded.raw, synced_at = excluded.synced_at;
