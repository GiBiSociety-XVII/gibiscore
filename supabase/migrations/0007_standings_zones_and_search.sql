-- GiBiScore: qualification/relegation zones in standings and trigram search on names.
alter table football.standings add column if not exists description text;
create extension if not exists pg_trgm with schema extensions;
create index if not exists teams_name_trgm_idx on football.teams using gin (name extensions.gin_trgm_ops);
create index if not exists players_name_trgm_idx on football.players using gin (name extensions.gin_trgm_ops);
create index if not exists leagues_name_trgm_idx on football.leagues using gin (name extensions.gin_trgm_ops);
