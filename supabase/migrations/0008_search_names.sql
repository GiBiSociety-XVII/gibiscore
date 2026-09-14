-- Name search that ignores accents and case: "hojlund" finds Højlund,
-- "calhanoglu" finds Çalhanoğlu. A folded copy of every name, kept by
-- Postgres, with a trigram index for the substring search.
create extension if not exists unaccent with schema extensions;

create or replace function public.search_text(value text) returns text
language sql immutable parallel safe strict
set search_path = ''
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, value)) $$;

alter table public.players add column if not exists search_name text generated always as (public.search_text(name)) stored;
alter table public.teams   add column if not exists search_name text generated always as (public.search_text(name)) stored;
alter table public.leagues add column if not exists search_name text generated always as (public.search_text(name)) stored;

create index if not exists players_search_name_trgm_idx on public.players using gin (search_name extensions.gin_trgm_ops);
create index if not exists teams_search_name_trgm_idx   on public.teams   using gin (search_name extensions.gin_trgm_ops);
create index if not exists leagues_search_name_trgm_idx on public.leagues using gin (search_name extensions.gin_trgm_ops);
