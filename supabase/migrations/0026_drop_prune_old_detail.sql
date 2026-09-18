-- The detail of old matches stays. The match page draws events, lineups, team
-- statistics and player lines for any fixture, and the player page builds its
-- season list and its match-by-match table out of those lines: dropping them
-- for the minor leagues would empty those pages for their old matches, and the
-- provider charges to fetch them again. The nightly job now only forgets what
-- nothing reads (raw payloads and bookkeeping): see lib/football/sync/prune.ts.
drop function if exists public.prune_old_detail(int, int);
