-- GiBiScore: the lineups frozen at kick-off of the last rounds, per team,
-- kept in the account so every device can score the recaps of the rounds
-- gone by (the device alone lost them when another device took over).

alter table public.fantasy_teams add column locks jsonb not null default '[]'::jsonb;
