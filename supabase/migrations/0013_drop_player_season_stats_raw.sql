-- Apply after the sync writes to player_season_raw (0012): the column
-- goes, and the table is rewritten so the pages actually shrink.
alter table football.player_season_stats drop column if exists raw;
