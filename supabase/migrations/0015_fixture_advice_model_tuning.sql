-- GiBiScore: the slips the model proposes for a match, snapshotted before
-- kick-off and settled on the final score (the public record of the
-- advice), and the tuning of the prediction model fitted on the archive
-- by fit-model, read by every prediction.

create table public.fixture_advice (
    fixture_id bigint not null references public.fixtures(id) on delete cascade,
    tier text not null,
    legs jsonb not null,
    pct smallint not null,
    fair numeric(6,2) not null,
    odds numeric(6,2),
    prediction jsonb not null,
    advised_at timestamptz not null default now(),
    hit boolean,
    settled_at timestamptz,
    primary key (fixture_id, tier)
);
create index fixture_advice_settled_idx on public.fixture_advice (settled_at desc) where hit is not null;
create index fixture_advice_open_idx on public.fixture_advice (fixture_id) where hit is null;

create table public.model_tuning (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.fixture_advice enable row level security;
create policy fixture_advice_public_read on public.fixture_advice for select to anon, authenticated using (true);
alter table public.model_tuning enable row level security;
create policy model_tuning_public_read on public.model_tuning for select to anon, authenticated using (true);
