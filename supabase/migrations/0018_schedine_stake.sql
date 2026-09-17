-- GiBiScore: a saved slip remembers what was staked on it, so the ticket
-- in the account shows the stake and what it pays.
--
-- stake: the total staked (sum of the lines for a system).
-- payout: what comes back when every selection wins (every column of
-- every line for a system), at the odds shown when the slip was saved.
-- lines: for a system, the lines "k su N" with their columns and the
-- stake per column, as the user set them; null otherwise.

alter table public.schedine
    add column if not exists stake numeric(8,2),
    add column if not exists payout numeric(10,2),
    add column if not exists lines jsonb;
