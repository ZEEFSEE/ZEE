create table if not exists public.mia_evolution_candidates (
  candidate_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.mia_identity(id),
  gene_id text,
  gene_type text not null check (gene_type in ('verified_insight','stable_trait_upgrade','soul_anchor','core_principle')),
  state text not null default 'candidate' check (state in (
    'candidate','evidence_check','stability_check','privacy_review','contradiction_check',
    'human_review','approved_for_shadow','shadow_observation','approved_for_release','committed',
    'deferred','rejected','blocked_source_health','blocked_privacy','blocked_conflict'
  )),
  memory_pointer text not null,
  source_scope text not null,
  explicit_marked_at timestamptz not null,
  observation_window_start timestamptz,
  observation_window_end timestamptz,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  distinct_observation_dates integer not null default 0 check (distinct_observation_dates >= 0),
  fact_summary text,
  interpretation_summary text,
  emotion_summary text,
  confidence numeric check (confidence >= 0 and confidence <= 1),
  confidence_rubric_version text,
  duplicate_check_status text not null default 'pending',
  contradiction_check_status text not null default 'pending',
  privacy_review_status text not null default 'pending',
  reviewer_decision text,
  reviewer_id text,
  reviewed_at timestamptz,
  proposed_gene_version text,
  last_known_good_version text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.mia_evolution_candidate_events (
  event_id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.mia_evolution_candidates(candidate_id),
  identity_id uuid not null references public.mia_identity(id),
  from_state text,
  to_state text not null,
  actor text not null,
  reason_code text not null,
  reason_summary text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mia_evolution_candidates_state_created_idx on public.mia_evolution_candidates(state, created_at);
create index if not exists mia_evolution_candidates_gene_type_idx on public.mia_evolution_candidates(gene_type, state, explicit_marked_at);
create index if not exists mia_evolution_candidate_events_candidate_created_idx on public.mia_evolution_candidate_events(candidate_id, created_at);
alter table public.mia_evolution_candidates enable row level security;
alter table public.mia_evolution_candidate_events enable row level security;
revoke all on public.mia_evolution_candidates from anon, authenticated;
revoke all on public.mia_evolution_candidate_events from anon, authenticated;
grant select, insert, update on public.mia_evolution_candidates to service_role;
grant select, insert on public.mia_evolution_candidate_events to service_role;
revoke update, delete, truncate on public.mia_evolution_candidate_events from service_role;
-- Candidate transition guard/logging are installed by the later hardening migrations.
create or replace function public.mia_evolution_prevent_candidate_event_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin raise exception 'Evolution candidate events are append-only'; end; $$;
create trigger mia_evolution_candidate_events_no_mutation
before update or delete on public.mia_evolution_candidate_events
for each row execute function public.mia_evolution_prevent_candidate_event_mutation();
create trigger mia_evolution_candidate_events_no_truncate
before truncate on public.mia_evolution_candidate_events
for each statement execute function public.mia_evolution_prevent_candidate_event_mutation();
revoke all on function public.mia_evolution_guard_candidate_transition() from public, anon, authenticated;
revoke all on function public.mia_evolution_prevent_candidate_event_mutation() from public, anon, authenticated;
