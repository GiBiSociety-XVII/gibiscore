-- GiBiScore: follow every API-Football competition, with two tiers.
-- featured = full detail (teams, squads, lineups, player stats, injuries,
-- standings every 30 minutes); basic = fixtures, scores, events and daily
-- standings.
alter table football.leagues add column tier text not null default 'basic';
alter table football.leagues add column country_code text;
alter table football.leagues add column season_coverage jsonb;
create index leagues_tier_idx on football.leagues(tier);
create index leagues_country_idx on football.leagues(country);
create index fixtures_league_starting_idx on football.fixtures(league_id, starting_at);
