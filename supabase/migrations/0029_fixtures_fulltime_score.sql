-- The score at ninety minutes, for a match that went to extra time: the
-- provider's `goals` (home_score, away_score) include the extra time,
-- and every market a slip is priced against settles on ninety minutes.
-- Null when the match ended in regular time (the score is the score).

alter table public.fixtures add column if not exists home_score_ft smallint;
alter table public.fixtures add column if not exists away_score_ft smallint;
