-- GiBiScore: track which fixtures have their detail (events, lineups,
-- statistics, player stats) stored, so a backfill job can fill the past.
alter table football.fixtures add column details_synced_at timestamptz;
create index fixtures_details_pending_idx on football.fixtures(starting_at) where details_synced_at is null and state = 'finished';
