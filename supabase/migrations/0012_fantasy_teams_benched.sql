-- GiBiScore: players sent to the bench by hand on the lineup page (swapped
-- out for someone else), kept in the account next to the pins and outs so
-- every device shows the same eleven.

alter table public.fantasy_teams add column benched jsonb not null default '[]'::jsonb;
