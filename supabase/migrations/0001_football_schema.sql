-- GiBiScore: initial football schema.
--
-- Design notes (docs/PLANNING.md, sections 5 and 9.4):
-- * everything provider-related lives in schema `football`, user data in `public`;
-- * every entity keeps the Sportmonks id in `sportmonks_id` next to our own
--   primary key, so the provider can change without losing history;
-- * we store far more than the score (events, per-player stats, xG, odds
--   snapshots) from day one, because prediction models need the history;
-- * public read access through RLS, writes only with the service key.
--
-- One-time manual step: expose the `football` schema in the Supabase
-- dashboard (Project Settings -> Data API -> Exposed schemas) so the
-- browser/SSR client can query it.

create schema if not exists football;

grant usage on schema football to anon, authenticated, service_role;
alter default privileges in schema football grant select on tables to anon, authenticated;
alter default privileges in schema football grant all on tables to service_role;
alter default privileges in schema football grant all on sequences to service_role;

-- ---------------------------------------------------------------------------
-- Reference entities
-- ---------------------------------------------------------------------------

create table football.leagues (
    id              bigint generated always as identity primary key,
    sportmonks_id   bigint not null unique,
    name            text not null,
    short_code      text,
    country         text,
    type            text,                 -- league, cup, ...
    logo_url        text,
    slug            text not null unique, -- e.g. serie-a
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table football.seasons (
    id              bigint generated always as identity primary key,
    sportmonks_id   bigint not null unique,
    league_id       bigint not null references football.leagues(id) on delete cascade,
    name            text not null,        -- e.g. 2026/2027
    is_current      boolean not null default false,
    starting_at     date,
    ending_at       date,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index seasons_league_idx on football.seasons(league_id);

create table football.teams (
    id              bigint generated always as identity primary key,
    sportmonks_id   bigint not null unique,
    name            text not null,
    short_code      text,
    country         text,
    logo_url        text,
    venue_name      text,
    slug            text not null unique,
    founded         smallint,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table football.players (
    id              bigint generated always as identity primary key,
    sportmonks_id   bigint not null unique,
    name            text not null,
    display_name    text,
    position        text,                 -- goalkeeper, defender, midfielder, attacker
    detailed_position text,
    date_of_birth   date,
    nationality     text,
    image_url       text,
    height_cm       smallint,
    weight_kg       smallint,
    slug            text not null unique,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Which team a player belongs to in a given season (transfers create new rows).
create table football.squad_members (
    season_id       bigint not null references football.seasons(id) on delete cascade,
    team_id         bigint not null references football.teams(id) on delete cascade,
    player_id       bigint not null references football.players(id) on delete cascade,
    jersey_number   smallint,
    is_captain      boolean not null default false,
    updated_at      timestamptz not null default now(),
    primary key (season_id, team_id, player_id)
);
create index squad_members_player_idx on football.squad_members(player_id);

-- ---------------------------------------------------------------------------
-- Fixtures and everything attached to a fixture
-- ---------------------------------------------------------------------------

create type football.fixture_state as enum (
    'scheduled', 'live', 'half_time', 'extra_time', 'penalties',
    'finished', 'postponed', 'cancelled', 'abandoned', 'unknown'
);

create table football.fixtures (
    id              bigint generated always as identity primary key,
    sportmonks_id   bigint not null unique,
    league_id       bigint not null references football.leagues(id),
    season_id       bigint not null references football.seasons(id),
    round           text,
    stage           text,
    starting_at     timestamptz not null,
    state           football.fixture_state not null default 'scheduled',
    minute          smallint,
    home_team_id    bigint not null references football.teams(id),
    away_team_id    bigint not null references football.teams(id),
    home_score      smallint,
    away_score      smallint,
    home_score_ht   smallint,
    away_score_ht   smallint,
    venue_name      text,
    referee         text,
    attendance      integer,
    raw             jsonb,                -- last provider payload, for debugging/backfills
    last_synced_at  timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index fixtures_starting_at_idx on football.fixtures(starting_at);
create index fixtures_season_idx on football.fixtures(season_id, starting_at);
create index fixtures_state_idx on football.fixtures(state) where state in ('live', 'half_time', 'extra_time', 'penalties');
create index fixtures_home_idx on football.fixtures(home_team_id);
create index fixtures_away_idx on football.fixtures(away_team_id);

create table football.fixture_events (
    id                  bigint generated always as identity primary key,
    sportmonks_id       bigint unique,
    fixture_id          bigint not null references football.fixtures(id) on delete cascade,
    team_id             bigint references football.teams(id),
    player_id           bigint references football.players(id),
    related_player_id   bigint references football.players(id),  -- assist, substituted player
    type                text not null,    -- goal, own_goal, penalty, yellow_card, red_card, substitution, var, ...
    minute              smallint,
    extra_minute        smallint,
    result              text,             -- score after the event, e.g. 2-1
    info                text,
    sort_order          integer,
    created_at          timestamptz not null default now()
);
create index fixture_events_fixture_idx on football.fixture_events(fixture_id, sort_order);
create index fixture_events_player_idx on football.fixture_events(player_id);

create table football.fixture_team_stats (
    fixture_id      bigint not null references football.fixtures(id) on delete cascade,
    team_id         bigint not null references football.teams(id),
    possession      numeric(5,2),
    shots_total     smallint,
    shots_on_target smallint,
    corners         smallint,
    fouls           smallint,
    yellow_cards    smallint,
    red_cards       smallint,
    passes_total    integer,
    pass_accuracy   numeric(5,2),
    xg              numeric(5,2),
    xg_on_target    numeric(5,2),
    stats           jsonb,                -- every other provider stat, keyed by name
    updated_at      timestamptz not null default now(),
    primary key (fixture_id, team_id)
);

create table football.fixture_player_stats (
    fixture_id      bigint not null references football.fixtures(id) on delete cascade,
    player_id       bigint not null references football.players(id),
    team_id         bigint not null references football.teams(id),
    minutes_played  smallint,
    rating          numeric(4,2),
    goals           smallint not null default 0,
    assists         smallint not null default 0,
    shots_total     smallint,
    shots_on_target smallint,
    key_passes      smallint,
    yellow_cards    smallint not null default 0,
    red_cards       smallint not null default 0,
    xg              numeric(5,2),
    xa              numeric(5,2),
    stats           jsonb,
    updated_at      timestamptz not null default now(),
    primary key (fixture_id, player_id)
);
create index fixture_player_stats_player_idx on football.fixture_player_stats(player_id);

create table football.lineups (
    fixture_id          bigint not null references football.fixtures(id) on delete cascade,
    team_id             bigint not null references football.teams(id),
    player_id           bigint not null references football.players(id),
    is_expected         boolean not null default false,  -- true = pre-match expected lineup
    is_starter          boolean not null default true,
    formation           text,             -- e.g. 4-3-3
    formation_position  smallint,
    jersey_number       smallint,
    updated_at          timestamptz not null default now(),
    primary key (fixture_id, team_id, player_id, is_expected)
);

create table football.standings (
    season_id       bigint not null references football.seasons(id) on delete cascade,
    team_id         bigint not null references football.teams(id),
    stage           text not null default 'regular',
    "group"         text not null default '',
    position        smallint not null,
    played          smallint not null default 0,
    won             smallint not null default 0,
    drawn           smallint not null default 0,
    lost            smallint not null default 0,
    goals_for       smallint not null default 0,
    goals_against   smallint not null default 0,
    points          smallint not null default 0,
    form            text,                 -- e.g. WWDLW
    updated_at      timestamptz not null default now(),
    primary key (season_id, stage, "group", team_id)
);

-- Sidelined players: injuries and suspensions.
create table football.sidelined (
    id              bigint generated always as identity primary key,
    sportmonks_id   bigint unique,
    player_id       bigint not null references football.players(id) on delete cascade,
    team_id         bigint references football.teams(id),
    category        text not null,        -- injury, suspension
    description     text,
    start_date      date,
    end_date        date,
    games_missed    smallint,
    updated_at      timestamptz not null default now()
);
create index sidelined_player_idx on football.sidelined(player_id);

-- Odds are captured as snapshots so we keep the history the models need.
create table football.odds_snapshots (
    id              bigint generated always as identity primary key,
    fixture_id      bigint not null references football.fixtures(id) on delete cascade,
    bookmaker       text not null,
    market          text not null,        -- 1x2, over_under_2.5, btts, ...
    label           text not null,        -- home, draw, away, over, under, yes, no ...
    value           numeric(8,3) not null,-- decimal odds
    probability     numeric(6,4),         -- implied, if the provider gives it
    captured_at     timestamptz not null default now()
);
create index odds_snapshots_fixture_idx on football.odds_snapshots(fixture_id, market, captured_at);

-- ---------------------------------------------------------------------------
-- Operational
-- ---------------------------------------------------------------------------

create table football.sync_runs (
    id              bigint generated always as identity primary key,
    job             text not null,        -- sync-fixtures, sync-standings, ...
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    status          text not null default 'running',  -- running, ok, error
    requests_used   integer,
    details         jsonb
);
create index sync_runs_job_idx on football.sync_runs(job, started_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function football.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
declare
    t text;
begin
    foreach t in array array[
        'leagues', 'seasons', 'teams', 'players', 'squad_members', 'fixtures',
        'fixture_team_stats', 'fixture_player_stats', 'lineups', 'standings', 'sidelined'
    ]
    loop
        execute format(
            'create trigger %I_touch_updated_at before update on football.%I for each row execute function football.touch_updated_at()',
            t, t
        );
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: public read, no client writes
-- ---------------------------------------------------------------------------

do $$
declare
    t text;
begin
    foreach t in array array[
        'leagues', 'seasons', 'teams', 'players', 'squad_members', 'fixtures',
        'fixture_events', 'fixture_team_stats', 'fixture_player_stats', 'lineups',
        'standings', 'sidelined', 'odds_snapshots'
    ]
    loop
        execute format('alter table football.%I enable row level security', t);
        execute format(
            'create policy %I on football.%I for select to anon, authenticated using (true)',
            t || '_public_read', t
        );
        execute format('grant select on football.%I to anon, authenticated', t);
    end loop;
end;
$$;

-- sync_runs is internal: RLS on, no policies, so only the service key reads it.
alter table football.sync_runs enable row level security;
