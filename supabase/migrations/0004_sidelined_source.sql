-- Where an absence row comes from: 'fixture' = the provider's per-fixture injury list (a missed or doubtful fixture),
-- 'player' = the provider's per-player spells (start and expected end of an injury or suspension).
alter table public.sidelined add column if not exists source text not null default 'fixture';
create index if not exists sidelined_source_idx on public.sidelined(source);
