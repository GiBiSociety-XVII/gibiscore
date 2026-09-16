-- GiBiScore: pre-match odds of the bookmakers, per fixture and bookmaker,
-- for the four markets the match page reads (1X2, double chance, goals
-- over/under, both teams to score). Refreshed by sync-odds for the
-- featured fixtures of the next days; dropped with the fixture.

create table public.fixture_odds (
    fixture_id bigint not null references public.fixtures(id) on delete cascade,
    bookmaker_id integer not null,
    bookmaker text not null,
    markets jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (fixture_id, bookmaker_id)
);

alter table public.fixture_odds enable row level security;
create policy fixture_odds_public_read on public.fixture_odds for select to anon, authenticated using (true);
