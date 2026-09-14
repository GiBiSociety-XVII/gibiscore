-- GiBiScore: a signed-in user's favourites (competitions and teams, by slug, in the order chosen),
-- so the rail, the highlighted rows and the "Preferiti" group are the same on every device.
create table public.user_favorites (
    user_id       uuid primary key references auth.users(id) on delete cascade,
    competitions  jsonb not null default '[]'::jsonb,
    teams         jsonb not null default '[]'::jsonb,
    updated_at    timestamptz not null default now()
);

create trigger user_favorites_touch_updated_at before update on public.user_favorites
    for each row execute function public.touch_updated_at();

alter table public.user_favorites enable row level security;
create policy user_favorites_select on public.user_favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy user_favorites_insert on public.user_favorites for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_favorites_update on public.user_favorites for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_favorites_delete on public.user_favorites for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_favorites from anon;
grant select, insert, update, delete on public.user_favorites to authenticated;
