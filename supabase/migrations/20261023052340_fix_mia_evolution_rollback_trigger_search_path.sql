-- Applied to zee-extension as migration 20261023052340.
-- Harden the append-only trigger function against search_path shadowing.
create or replace function public.prevent_mia_evolution_rollback_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'mia_evolution_rollback_events is append-only; insert a linked correction event instead';
end;
$$;
revoke all on function public.prevent_mia_evolution_rollback_event_mutation() from public, anon, authenticated;
