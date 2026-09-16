-- GiBiScore: players named the fantasy way. Fantacalcio.it writes a
-- player one way ("Valdepenas", "Goncalves P."), the provider another
-- ("Valde", "Pote"): the fantasy name is what the readers know, so once it
-- is set the display name follows it and the provider's sync may not
-- overwrite it. The name changes again only together with a new fantasy
-- name (the admin routes set both at once).

alter table public.players add column fanta_name text;

create or replace function public.players_keep_fanta_name() returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.fanta_name is not null and new.fanta_name is not distinct from old.fanta_name then
        new.name := old.name;
    end if;
    return new;
end
$$;

create trigger players_keep_fanta_name before update on public.players
    for each row execute function public.players_keep_fanta_name();
