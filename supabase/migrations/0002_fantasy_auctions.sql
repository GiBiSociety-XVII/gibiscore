-- GiBiScore: fantasy auctions saved by signed-in users.
--
-- One row per auction: the settings (league, credits, slots, rules,
-- managers, strategy, constraints) and the purchases, as the device keeps
-- them, so an auction can be reopened on any device. Users read and write
-- their own rows only (Supabase Auth, RLS on auth.uid()).

create table public.fantasy_auctions (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    name        text not null,
    league      text not null,
    config      jsonb not null,
    purchases   jsonb not null default '[]'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index fantasy_auctions_user_idx on public.fantasy_auctions(user_id, updated_at desc);

create trigger fantasy_auctions_touch_updated_at before update on public.fantasy_auctions
    for each row execute function public.touch_updated_at();

alter table public.fantasy_auctions enable row level security;
create policy fantasy_auctions_select on public.fantasy_auctions for select to authenticated using ((select auth.uid()) = user_id);
create policy fantasy_auctions_insert on public.fantasy_auctions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fantasy_auctions_update on public.fantasy_auctions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy fantasy_auctions_delete on public.fantasy_auctions for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.fantasy_auctions from anon;
grant select, insert, update, delete on public.fantasy_auctions to authenticated;
