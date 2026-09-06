-- GiBiScore: the database, from scratch, in the public schema.
--
-- Everything the site reads lives in `public`, where the Supabase dashboard
-- and the Data API see it without configuration. The earlier `football`
-- schema and its history go: the crons rebuild the data within the plan's
-- request budget (docs/SETUP.md, "Primo avvio").
--
-- Rules:
-- * every provider entity keeps the API-Football id in `provider_id` next
--   to our own primary key, so the provider can change without losing history;
-- * public read access through RLS, writes only with the service key;
-- * sync bookkeeping (sync_runs, sync_state) and the provider's raw
--   payloads (player_season_raw) are not readable by the site: RLS on,
--   no policy, service key only.

drop schema if exists football cascade;
delete from supabase_migrations.schema_migrations where version < '20260906';

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Reference entities
-- ---------------------------------------------------------------------------

create table public.leagues (
    id              bigint generated always as identity primary key,
    provider_id     bigint not null unique,
    name            text not null,
    short_code      text,
    country         text,
    country_code    text,
    type            text,                 -- league, cup
    logo_url        text,
    slug            text not null unique, -- e.g. serie-a
    tier            text not null default 'basic', -- featured: full detail; basic: fixtures, scores, events
    is_active       boolean not null default true,
    season_coverage jsonb,                -- what the provider covers for the current season
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index leagues_tier_idx on public.leagues(tier);
create index leagues_country_idx on public.leagues(country);
create index leagues_name_trgm_idx on public.leagues using gin (name extensions.gin_trgm_ops);

-- API-Football seasons have no id: league + year.
create table public.seasons (
    id                  bigint generated always as identity primary key,
    league_id           bigint not null references public.leagues(id) on delete cascade,
    year                smallint not null,
    name                text not null,    -- e.g. 2026/2027
    is_current          boolean not null default false,
    starting_at         date,
    ending_at           date,
    fixtures_listed_at  timestamptz,      -- whole-season fixture list last fetched (backfill)
    players_synced_at   timestamptz,      -- season statistics per player last fetched
    standings_synced_at timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (league_id, year)
);
create index seasons_league_idx on public.seasons(league_id);
create index seasons_current_idx on public.seasons(is_current) where is_current;

create table public.teams (
    id                   bigint generated always as identity primary key,
    provider_id          bigint not null unique,
    name                 text not null,
    short_code           text,
    country              text,
    logo_url             text,
    venue_name           text,
    slug                 text not null unique,
    founded              smallint,
    squad_synced_at      timestamptz,     -- squad last fetched (featured clubs)
    transfers_synced_at  timestamptz,     -- transfer feed last read (featured clubs)
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);
create index teams_name_trgm_idx on public.teams using gin (name extensions.gin_trgm_ops);

create table public.players (
    id                bigint generated always as identity primary key,
    provider_id       bigint not null unique,
    name              text not null,
    first_name        text,
    last_name         text,
    position          text,               -- goalkeeper, defender, midfielder, attacker
    age               smallint,
    date_of_birth     date,
    nationality       text,
    birth_place       text,
    birth_country     text,
    image_url         text,
    height_cm         smallint,
    weight_kg         smallint,
    injured           boolean not null default false,
    profile_synced_at timestamptz,
    slug              text not null unique,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index players_name_trgm_idx on public.players using gin (name extensions.gin_trgm_ops);

-- Which teams take part in a season (featured leagues: from the provider's team list).
create table public.season_teams (
    season_id       bigint not null references public.seasons(id) on delete cascade,
    team_id         bigint not null references public.teams(id) on delete cascade,
    updated_at      timestamptz not null default now(),
    primary key (season_id, team_id)
);
create index season_teams_team_idx on public.season_teams(team_id);

-- Which team a player belongs to in a given season.
create table public.squad_members (
    season_id       bigint not null references public.seasons(id) on delete cascade,
    team_id         bigint not null references public.teams(id) on delete cascade,
    player_id       bigint not null references public.players(id) on delete cascade,
    jersey_number   smallint,
    is_captain      boolean not null default false,
    updated_at      timestamptz not null default now(),
    primary key (season_id, team_id, player_id)
);
create index squad_members_player_idx on public.squad_members(player_id);
create index squad_members_team_idx on public.squad_members(team_id);

-- ---------------------------------------------------------------------------
-- Fixtures and everything attached to a fixture
-- ---------------------------------------------------------------------------

create type public.fixture_state as enum (
    'scheduled', 'live', 'half_time', 'extra_time', 'penalties',
    'finished', 'postponed', 'cancelled', 'abandoned', 'unknown'
);

create table public.fixtures (
    id                bigint generated always as identity primary key,
    provider_id       bigint not null unique,
    league_id         bigint not null references public.leagues(id),
    season_id         bigint not null references public.seasons(id),
    round             text,
    stage             text,
    starting_at       timestamptz not null,
    state             public.fixture_state not null default 'scheduled',
    minute            smallint,
    extra_minute      smallint,           -- stoppage time of a live fixture: "90+3"
    home_team_id      bigint not null references public.teams(id),
    away_team_id      bigint not null references public.teams(id),
    home_score        smallint,
    away_score        smallint,
    home_score_ht     smallint,
    away_score_ht     smallint,
    venue_name        text,
    referee           text,
    last_synced_at    timestamptz,        -- last time any payload of this fixture was stored
    details_synced_at timestamptz,        -- last time events, lineups and statistics were stored
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index fixtures_starting_at_idx on public.fixtures(starting_at);
create index fixtures_season_starting_idx on public.fixtures(season_id, starting_at);
create index fixtures_league_starting_idx on public.fixtures(league_id, starting_at);
create index fixtures_home_team_idx on public.fixtures(home_team_id, starting_at);
create index fixtures_away_team_idx on public.fixtures(away_team_id, starting_at);
create index fixtures_live_idx on public.fixtures(state) where state in ('live', 'half_time', 'extra_time', 'penalties');
create index fixtures_details_pending_idx on public.fixtures(starting_at) where details_synced_at is null and state = 'finished';

-- Events have no provider id: the timeline of a fixture is replaced on every sync.
create table public.fixture_events (
    id                  bigint generated always as identity primary key,
    fixture_id          bigint not null references public.fixtures(id) on delete cascade,
    team_id             bigint references public.teams(id),
    player_id           bigint references public.players(id),
    related_player_id   bigint references public.players(id),  -- assist, substituted player
    player_name         text,
    related_player_name text,
    type                text not null,    -- goal, own_goal, penalty, yellow_card, red_card, substitution, var ...
    minute              smallint,
    extra_minute        smallint,
    info                text,
    sort_order          integer,
    created_at          timestamptz not null default now()
);
create index fixture_events_fixture_idx on public.fixture_events(fixture_id, sort_order);
create index fixture_events_player_idx on public.fixture_events(player_id);

create table public.fixture_team_stats (
    fixture_id      bigint not null references public.fixtures(id) on delete cascade,
    team_id         bigint not null references public.teams(id),
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

create table public.fixture_player_stats (
    fixture_id      bigint not null references public.fixtures(id) on delete cascade,
    player_id       bigint not null references public.players(id),
    team_id         bigint not null references public.teams(id),
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
create index fixture_player_stats_player_idx on public.fixture_player_stats(player_id);

create table public.lineups (
    fixture_id          bigint not null references public.fixtures(id) on delete cascade,
    team_id             bigint not null references public.teams(id),
    player_id           bigint not null references public.players(id),
    is_expected         boolean not null default false,  -- true = pre-match expected lineup
    is_starter          boolean not null default true,
    formation           text,             -- e.g. 4-3-3
    formation_position  smallint,         -- slot in the formation grid, starters only
    jersey_number       smallint,
    updated_at          timestamptz not null default now(),
    primary key (fixture_id, team_id, player_id, is_expected)
);
create index lineups_player_idx on public.lineups(player_id);

create table public.standings (
    season_id       bigint not null references public.seasons(id) on delete cascade,
    team_id         bigint not null references public.teams(id),
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
    description     text,                 -- qualification / relegation zone
    updated_at      timestamptz not null default now(),
    primary key (season_id, stage, "group", team_id)
);
create index standings_season_idx on public.standings(season_id, "group", position);
create index standings_team_idx on public.standings(team_id);

-- Sidelined players: one row per fixture missed, replaced per season on every sync.
create table public.sidelined (
    id              bigint generated always as identity primary key,
    player_id       bigint not null references public.players(id) on delete cascade,
    team_id         bigint references public.teams(id),
    season_id       bigint references public.seasons(id) on delete cascade,
    fixture_id      bigint references public.fixtures(id) on delete set null,
    category        text not null,        -- injury, suspension, doubtful, other
    description     text,
    start_date      date,
    end_date        date,
    games_missed    smallint,
    updated_at      timestamptz not null default now()
);
create index sidelined_player_idx on public.sidelined(player_id);
create index sidelined_team_idx on public.sidelined(team_id);
create index sidelined_season_idx on public.sidelined(season_id);

-- ---------------------------------------------------------------------------
-- Season statistics per player, as aggregated by API-Football
-- ---------------------------------------------------------------------------

create table public.player_season_stats (
    id                  bigint generated always as identity primary key,
    player_id           bigint not null references public.players(id) on delete cascade,
    team_id             bigint not null references public.teams(id) on delete cascade,
    league_id           bigint not null references public.leagues(id) on delete cascade,
    season_year         smallint not null,
    season_id           bigint references public.seasons(id) on delete set null,
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
    synced_at           timestamptz not null default now(),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (player_id, team_id, league_id, season_year)
);
create index player_season_stats_player_idx on public.player_season_stats(player_id, season_year desc);
create index player_season_stats_league_idx on public.player_season_stats(league_id, season_year);
create index player_season_stats_team_idx   on public.player_season_stats(team_id, season_year);
-- Top scorers / assists: the full sort key, so the query stops after 20 rows.
create index player_season_stats_top_goals_idx
    on public.player_season_stats (league_id, season_year, goals desc, assists desc, minutes)
    where goals > 0;
create index player_season_stats_top_assists_idx
    on public.player_season_stats (league_id, season_year, assists desc, goals desc, minutes)
    where assists > 0;

-- The provider's full payload, kept apart: nobody on the site reads it.
create table public.player_season_raw (
    player_id    bigint not null references public.players(id) on delete cascade,
    team_id      bigint not null references public.teams(id) on delete cascade,
    league_id    bigint not null references public.leagues(id) on delete cascade,
    season_year  smallint not null,
    raw          jsonb not null,
    synced_at    timestamptz not null default now(),
    primary key (player_id, team_id, league_id, season_year)
);

-- ---------------------------------------------------------------------------
-- Operational
-- ---------------------------------------------------------------------------

create table public.sync_runs (
    id              bigint generated always as identity primary key,
    job             text not null,        -- sync-fixtures, sync-standings ...
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    status          text not null default 'running',  -- running, ok, error
    requests_used   integer,
    details         jsonb
);
create index sync_runs_job_idx on public.sync_runs(job, started_at desc);

-- Small facts shared between jobs: the day's request quota, above all.
create table public.sync_state (
    key         text primary key,
    value       jsonb not null,
    updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
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
        'fixture_team_stats', 'fixture_player_stats', 'lineups', 'standings', 'sidelined',
        'player_season_stats'
    ]
    loop
        execute format(
            'create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
            t, t
        );
    end loop;
end;
$$;

-- Starting slots per player, team, season and formation: what the
-- auction reads to derive fantasy roles and who competes for a spot.
create or replace function public.lineup_slots(p_season_ids bigint[])
returns table (player_id bigint, team_id bigint, season_id bigint, formation text, formation_position smallint, starts bigint)
language sql stable
set search_path = ''
as $$
    select l.player_id, l.team_id, f.season_id, l.formation, l.formation_position, count(*)::bigint as starts
    from public.lineups l
    join public.fixtures f on f.id = l.fixture_id
    where f.season_id = any(p_season_ids) and not l.is_expected and l.is_starter and l.formation_position is not null
    group by 1, 2, 3, 4, 5
$$;

-- Starts and benches per player, team and season: who is a fixed starter
-- when available and who is not.
create or replace function public.lineup_bench(p_season_ids bigint[])
returns table (player_id bigint, team_id bigint, season_id bigint, starts bigint, benches bigint)
language sql stable
set search_path = ''
as $$
    select l.player_id, l.team_id, f.season_id,
        count(*) filter (where l.is_starter)::bigint as starts,
        count(*) filter (where not l.is_starter)::bigint as benches
    from public.lineups l
    join public.fixtures f on f.id = l.fixture_id
    where f.season_id = any(p_season_ids) and not l.is_expected
    group by 1, 2, 3
$$;

-- Who started in a player's usual slots of the formation in the matches
-- he sat on the bench: the concrete rivals for his place.
create or replace function public.lineup_replacements(p_season_ids bigint[])
returns table (player_id bigint, team_id bigint, season_id bigint, starter_id bigint, matches bigint)
language sql stable
set search_path = ''
as $$
    with starts as (
        select l.fixture_id, l.team_id, l.player_id, l.formation_position as slot, f.season_id
        from public.lineups l join public.fixtures f on f.id = l.fixture_id
        where f.season_id = any(p_season_ids) and not l.is_expected and l.is_starter and l.formation_position is not null
    ),
    benched as (
        select l.fixture_id, l.team_id, l.player_id, f.season_id
        from public.lineups l join public.fixtures f on f.id = l.fixture_id
        where f.season_id = any(p_season_ids) and not l.is_expected and not l.is_starter
    ),
    own as (select player_id, team_id, slot from starts group by 1, 2, 3)
    select b.player_id, b.team_id, b.season_id, s.player_id as starter_id, count(distinct b.fixture_id)::bigint as matches
    from benched b
    join own o on o.player_id = b.player_id and o.team_id = b.team_id
    join starts s on s.fixture_id = b.fixture_id and s.team_id = b.team_id and s.slot = o.slot
    group by 1, 2, 3, 4
$$;

-- ---------------------------------------------------------------------------
-- Row level security: public read on the site's tables, no client writes;
-- the operational tables and the raw payloads are service-key only.
-- ---------------------------------------------------------------------------

do $$
declare
    t text;
begin
    foreach t in array array[
        'leagues', 'seasons', 'teams', 'players', 'season_teams', 'squad_members', 'fixtures',
        'fixture_events', 'fixture_team_stats', 'fixture_player_stats', 'lineups',
        'standings', 'sidelined', 'player_season_stats'
    ]
    loop
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
        execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    end loop;
    foreach t in array array['player_season_raw', 'sync_runs', 'sync_state']
    loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on public.%I from anon, authenticated', t);
    end loop;
end;
$$;
