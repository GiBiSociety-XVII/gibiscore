-- The policies of schedine call auth.uid() once per query, not once per
-- row: wrapped in a subselect, Postgres evaluates it as an init plan
-- (the database linter's auth_rls_initplan warning).

drop policy if exists schedine_own_read on public.schedine;
drop policy if exists schedine_own_insert on public.schedine;
drop policy if exists schedine_own_delete on public.schedine;

create policy schedine_own_read on public.schedine for select to authenticated using ((select auth.uid()) = user_id);
create policy schedine_own_insert on public.schedine for insert to authenticated with check ((select auth.uid()) = user_id);
create policy schedine_own_delete on public.schedine for delete to authenticated using ((select auth.uid()) = user_id);
