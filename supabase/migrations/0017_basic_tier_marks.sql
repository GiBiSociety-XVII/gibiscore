-- GiBiScore: the basic tier gets everything the provider covers, so the
-- jobs need two more marks to know what was asked and when.
--
-- fixtures.odds_synced_at: when sync-odds last asked the bookmakers for
-- the match (with or without an answer): featured fixtures every three
-- hours, basic ones once a day.
-- seasons.teams_listed_at: when sync-competitions last stored the teams
-- of the season (season_teams), refreshed weekly for every current season.

alter table public.fixtures add column if not exists odds_synced_at timestamptz;
alter table public.seasons add column if not exists teams_listed_at timestamptz;

-- The odds job asks the scheduled fixtures of the next days, oldest ask first.
create index if not exists fixtures_odds_due_idx on public.fixtures(starting_at, odds_synced_at) where state = 'scheduled';

-- Seasons already listed keep their mark: the teams of the featured seasons were stored by the old job.
update public.seasons s set teams_listed_at = x.listed_at
from (select season_id, max(updated_at) as listed_at from public.season_teams group by season_id) x
where x.season_id = s.id and s.teams_listed_at is null;
