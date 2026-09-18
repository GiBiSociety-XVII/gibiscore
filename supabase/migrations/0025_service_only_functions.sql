-- A function is granted to PUBLIC the moment it is created, and revoking it
-- from anon and authenticated (migrations 0023 and 0024) does not undo that:
-- through the REST layer anyone could have called them. These two write —
-- prune_old_detail deletes the detail of old matches, bump_error_hits counts
-- an error again — so they belong to the service role alone, which is what
-- the jobs and the read layer use.
revoke execute on function public.prune_old_detail(int, int) from public, anon, authenticated;
revoke execute on function public.bump_error_hits(bigint) from public, anon, authenticated;
grant execute on function public.prune_old_detail(int, int) to service_role;
grant execute on function public.bump_error_hits(bigint) to service_role;

-- The functions the public pages read through (schedina_by_token,
-- shared_auction, schedine_record, fantasy_round_votes) stay open on purpose:
-- they only read, and the anonymous key is how those pages are served.
