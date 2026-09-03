-- GiBiScore: player statistics per season (current and past), stored in our
-- database so formulas and rankings never hit the API at read time.
--
-- * football.player_season_stats: one row per player / team / competition /
--   season, as aggregated by API-Football (/players?league&season).
-- * players: richer profile (names, birth, injured flag) from the same feed.
-- * seasons: bookkeeping columns so history is imported once and the current
--   season is refreshed only after a matchday.

alter table football.players add column if not exists first_name text;
alter table football.players add column if not exists last_name text;
alter table football.players add column if not exists birth_place text;
alter table football.players add column if not exists birth_country text;
alter table football.players add column if not exists injured boolean not null default false;
alter table football.players add column if not exists profile_synced_at timestamptz;

alter table football.seasons add column if not exists fixtures_listed_at timestamptz;
alter table football.seasons add column if not exists players_synced_at timestamptz;

create table football.player_season_stats (
    id                  bigint generated always as identity primary key,
    player_id           bigint not null references football.players(id) on delete cascade,
    team_id             bigint not null references football.teams(id) on delete cascade,
    league_id           bigint not null references football.leagues(id) on delete cascade,
    season_year         smallint not null,
    season_id           bigint references football.seasons(id) on delete set null,
    position            text,
    jersey_number       smallint,
    captain             boolean not null default false,
    appearances         smallint,
    lineups             smallint,
    minutes             integer,
    rating              numeric(4,2),
    sub_in              smallint,
    sub_out             smallint,
    bench               smallint,
    shots_total         smallint,
    shots_on            smallint,
    goals               smallint,
    goals_conceded      smallint,
    assists             smallint,
    saves               smallint,
    passes_total        integer,
    passes_key          smallint,
    passes_accuracy     smallint,
    tackles_total       smallint,
    blocks              smallint,
    interceptions       smallint,
    duels_total         smallint,
    duels_won           smallint,
    dribbles_attempts   smallint,
    dribbles_success    smallint,
    dribbles_past       smallint,
    fouls_drawn         smallint,
    fouls_committed     smallint,
    yellow_cards        smallint,
    yellow_red_cards    smallint,
    red_cards           smallint,
    penalties_won       smallint,
    penalties_committed smallint,
    penalties_scored    smallint,
    penalties_missed    smallint,
    penalties_saved     smallint,
    raw                 jsonb,
    synced_at           timestamptz not null default now(),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (player_id, team_id, league_id, season_year)
);
create index player_season_stats_player_idx on football.player_season_stats(player_id, season_year desc);
create index player_season_stats_league_idx on football.player_season_stats(league_id, season_year);
create index player_season_stats_team_idx   on football.player_season_stats(team_id, season_year);
create index player_season_stats_goals_idx  on football.player_season_stats(league_id, season_year, goals desc);

alter table football.player_season_stats enable row level security;
create policy player_season_stats_read on football.player_season_stats for select to anon, authenticated using (true);
grant select on football.player_season_stats to anon, authenticated;
grant all on football.player_season_stats to service_role;
create trigger player_season_stats_touch_updated_at before update on football.player_season_stats
    for each row execute function football.touch_updated_at();
