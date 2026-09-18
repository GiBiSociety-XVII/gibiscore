-- GiBiScore: a saved slip keeps the outcome of each selection as the
-- matches end (true won, false lost, null still to play), so the ticket
-- ticks every row and a slip that can no longer win is closed at once,
-- without waiting for its last match.

alter table public.schedine add column if not exists results jsonb;
