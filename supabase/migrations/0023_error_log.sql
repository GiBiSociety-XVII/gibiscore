-- What broke while serving a page: the read layer's failures, the errors a
-- page boundary caught in the browser. Only the service role reads or writes
-- it (the admin dashboard uses that key); the prune job keeps it short.
create table if not exists public.error_log (
    id          bigint generated always as identity primary key,
    at          timestamptz not null default now(),
    -- read: a query of the read layer; client: an error boundary in the browser; api: a route.
    source      text not null,
    message     text not null,
    -- Next.js gives the browser only this digest of a server error: it ties the two sides together.
    digest      text,
    path        text,
    locale      text,
    user_agent  text,
    -- The same message again within the minute bumps this instead of adding a row.
    hits        integer not null default 1
);
create index if not exists error_log_at_idx on public.error_log(at desc);

alter table public.error_log enable row level security;
revoke all on public.error_log from anon, authenticated;

-- One more of the same message within the minute: the row counts it.
create or replace function public.bump_error_hits(row_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
    update public.error_log set hits = hits + 1, at = now() where id = row_id;
$$;
revoke all on function public.bump_error_hits(bigint) from anon, authenticated;
