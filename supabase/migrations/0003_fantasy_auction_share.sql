-- GiBiScore: a fantasy auction shared with the group by link.
--
-- The owner sets a share token on his row; anyone with the token reads,
-- through shared_auction(), the rosters and the purchases and the few
-- settings that describe the table (managers, credits, slots), never his
-- strategy, targets or the rest of the configuration. The function runs
-- as its owner, so the table stays closed to anonymous readers.

alter table public.fantasy_auctions add column share_token uuid unique;

create or replace function public.shared_auction(token uuid)
returns table(name text, league text, config jsonb, purchases jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
    select a.name,
           a.league,
           jsonb_build_object(
               'managers', a.config -> 'managers',
               'credits', a.config -> 'credits',
               'participants', a.config -> 'participants',
               'slots', a.config -> 'slots',
               'mode', a.config -> 'mode'
           ) as config,
           a.purchases,
           a.updated_at
    from public.fantasy_auctions a
    where token is not null and a.share_token = token
$$;

revoke all on function public.shared_auction(uuid) from public;
grant execute on function public.shared_auction(uuid) to anon, authenticated;
