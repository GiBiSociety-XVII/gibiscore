-- GiBiScore: the betting slips users generate from the model's advice
-- (predictions page), saved in their account and settled on the final
-- scores by the advice job; a public tally of how they did.

create table public.schedine (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null,
    risk text not null,
    size smallint not null,
    system_of smallint,
    selections jsonb not null,
    pct smallint not null,
    fair numeric(8,2) not null,
    book numeric(8,2),
    first_kickoff timestamptz not null,
    last_kickoff timestamptz not null,
    created_at timestamptz not null default now(),
    hits smallint,
    hit boolean,
    settled_at timestamptz
);
create index schedine_user_idx on public.schedine (user_id, created_at desc);
create index schedine_open_idx on public.schedine (last_kickoff) where hit is null;

alter table public.schedine enable row level security;
create policy schedine_own_read on public.schedine for select to authenticated using (auth.uid() = user_id);
create policy schedine_own_insert on public.schedine for insert to authenticated with check (auth.uid() = user_id);
create policy schedine_own_delete on public.schedine for delete to authenticated using (auth.uid() = user_id);

-- The site-wide tally, readable by anyone: how many slips were saved, settled and won.
create or replace function public.schedine_record()
returns table(total bigint, settled bigint, won bigint)
language sql stable security definer set search_path = public as $$
    select count(*), count(*) filter (where hit is not null), count(*) filter (where hit) from public.schedine;
$$;
revoke all on function public.schedine_record() from public;
grant execute on function public.schedine_record() to anon, authenticated;
