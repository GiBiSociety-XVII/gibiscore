-- GiBiScore: a saved slip can be shared with a link. Every slip gets a
-- token nobody can guess; /schedine/<token> shows the ticket to anyone,
-- read through a function that returns only what the ticket prints
-- (never the owner).

alter table public.schedine add column if not exists share_token text;
update public.schedine set share_token = replace(gen_random_uuid()::text, '-', '') where share_token is null;
alter table public.schedine alter column share_token set not null;
alter table public.schedine alter column share_token set default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists schedine_share_token_idx on public.schedine (share_token);

create or replace function public.schedina_by_token(token text)
returns table(id bigint, kind text, risk text, size smallint, system_of smallint, selections jsonb, pct smallint, fair numeric, book numeric, stake numeric, payout numeric, lines jsonb, last_kickoff timestamptz, created_at timestamptz, hits smallint, hit boolean, results jsonb)
language sql stable security definer set search_path = public as $$
    select id, kind, risk, size, system_of, selections, pct, fair, book, stake, payout, lines, last_kickoff, created_at, hits, hit, results
    from public.schedine where share_token = token limit 1;
$$;
revoke all on function public.schedina_by_token(text) from public;
grant execute on function public.schedina_by_token(text) to anon, authenticated;
