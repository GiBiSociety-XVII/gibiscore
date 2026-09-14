-- GiBiScore: a typed "no vote" is 0; null means the vote was not typed
-- (only the events were corrected) and the site keeps its own estimate.

alter table public.fantasy_votes drop constraint fantasy_votes_voto_check;
alter table public.fantasy_votes add constraint fantasy_votes_voto_check check (voto is null or voto = 0 or (voto >= 1 and voto <= 10));
