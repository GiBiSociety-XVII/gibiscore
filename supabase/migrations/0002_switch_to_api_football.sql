-- GiBiScore: switch the data provider from Sportmonks to API-Football.
--
-- * provider ids are renamed from sportmonks_id to provider_id (the column
--   keeps its role: the id in the provider's system next to our own id);
-- * API-Football seasons have no id, they are identified by league + year;
-- * API-Football events and injuries have no ids: they are replaced per
--   fixture / per season on every sync instead of upserted.
--
-- Safe to run on the empty database created by 0001; on a populated one the
-- Sportmonks ids would be meaningless and the tables should be truncated.

alter table football.leagues        rename column sportmonks_id to provider_id;
alter table football.seasons        rename column sportmonks_id to provider_id;
alter table football.teams          rename column sportmonks_id to provider_id;
alter table football.players        rename column sportmonks_id to provider_id;
alter table football.fixtures       rename column sportmonks_id to provider_id;
alter table football.fixture_events rename column sportmonks_id to provider_id;
alter table football.sidelined      rename column sportmonks_id to provider_id;

-- Seasons: identified by (league_id, year).
alter table football.seasons alter column provider_id drop not null;
alter table football.seasons drop constraint if exists seasons_sportmonks_id_key;
alter table football.seasons add column year smallint;
update football.seasons set year = coalesce(year, extract(year from starting_at)::smallint);
alter table football.seasons alter column year set not null;
alter table football.seasons add constraint seasons_league_year_key unique (league_id, year);

-- Events: no provider id, replaced per fixture.
alter table football.fixture_events drop constraint if exists fixture_events_sportmonks_id_key;
alter table football.fixture_events add column player_name text;
alter table football.fixture_events add column related_player_name text;

-- Sidelined: injuries are reported per fixture, replaced per season.
alter table football.sidelined drop constraint if exists sidelined_sportmonks_id_key;
alter table football.sidelined add column season_id bigint references football.seasons(id) on delete cascade;
alter table football.sidelined add column fixture_id bigint references football.fixtures(id) on delete set null;
create index sidelined_season_idx on football.sidelined(season_id);

-- Players: API-Football squads give age and photo, not birth date; keep a
-- lightweight age column for the fantasy pages until richer data is synced.
alter table football.players add column age smallint;
