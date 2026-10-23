-- Mia Evolution Rollback Event Ledger
-- Additive-only schema. No existing Mia tables or rows are modified.
create table if not exists public.mia_evolution_rollback_events (
  event_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.mia_identity(id),
  event_type text not null default 'Evolution_Rollback_Event'
    check (event_type = 'Evolution_Rollback_Event'),
  gene_id text not null check (length(trim(gene_id)) between 1 and 160),
  attempted_version integer not null check (attempted_version >= 1),
  attempted_commit text not null check (length(trim(attempted_commit)) between 1 and 160),
  rollback_to_version integer not null check (rollback_to_version >= 1),
  rollback_to_commit text not null check (length(trim(rollback_to_commit)) between 1 and 160),
  detected_at timestamptz not null,
  conflict_category text not null check (conflict_category in (
    'behavioral_conflict', 'logic_conflict', 'regression',
    'safety_conflict', 'context_mismatch', 'other'
  )),
  scenario_summary text not null check (length(trim(scenario_summary)) between 1 and 1200),
  expected_vs_observed jsonb not null default '{}'::jsonb
    check (jsonb_typeof(expected_vs_observed) = 'object'),
  evidence_pointers text[] not null default '{}',
  decision text not null check (length(trim(decision)) between 1 and 800),
  rollback_outcome text not null check (rollback_outcome in (
    'rolled_back', 'rollback_failed', 'rollback_pending'
  )),
  idempotency_key text not null unique check (length(trim(idempotency_key)) between 8 and 200),
  correction_of uuid null references public.mia_evolution_rollback_events(event_id),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists mia_evolution_rollback_events_identity_created_idx
  on public.mia_evolution_rollback_events (identity_id, created_at desc);
create index if not exists mia_evolution_rollback_events_gene_version_idx
  on public.mia_evolution_rollback_events (gene_id, attempted_version, created_at desc);

alter table public.mia_evolution_rollback_events enable row level security;
revoke all on table public.mia_evolution_rollback_events from anon, authenticated;
grant select, insert on table public.mia_evolution_rollback_events to service_role;

create or replace function public.prevent_mia_evolution_rollback_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'mia_evolution_rollback_events is append-only; insert a linked correction event instead';
end;
$$;

revoke all on function public.prevent_mia_evolution_rollback_event_mutation() from public, anon, authenticated;
drop trigger if exists mia_evolution_rollback_events_append_only on public.mia_evolution_rollback_events;
create trigger mia_evolution_rollback_events_append_only
before update or delete on public.mia_evolution_rollback_events
for each row execute function public.prevent_mia_evolution_rollback_event_mutation();
