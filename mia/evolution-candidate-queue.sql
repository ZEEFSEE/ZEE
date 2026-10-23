-- HISTORICAL INITIAL DRAFT; NOT A COMPLETE CURRENT DEPLOYMENT SCRIPT.
-- The candidate queue and audit events are now deployed in zee-extension.
-- Authoritative migration history:
--   supabase/migrations/20261023054637_create_mia_evolution_candidate_pipeline.sql
--   supabase/migrations/20261023054652_add_mia_evolution_review_gates.sql
--   database migration history also includes event-order/guard/logging hardening.
-- Do not run this file as a substitute for the migration chain.
-- Current live tables: mia_evolution_candidates, mia_evolution_candidate_events.
-- Current live endpoint: supabase/functions/mia-evolution-pipeline/index.ts
--
-- Original schema sketch; superseded by the applied migrations above.
-- Proposed private candidate metadata queue for Mia's growth pipeline.
-- Do not place raw chat text or direct identifiers in this table.
-- Review names, constraints, permissions, and RLS with a read-only audit before applying.

create table if not exists public.mia_evolution_candidates (
  candidate_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.mia_identity(id),
  gene_id text,
  gene_type text not null check (
    gene_type in ('verified_insight', 'stable_trait_upgrade', 'soul_anchor', 'core_principle')
  ),
  state text not null default 'candidate' check (
    state in (
      'candidate', 'evidence_check', 'stability_check', 'privacy_review',
      'contradiction_check', 'human_review', 'approved_for_shadow',
      'shadow_observation', 'approved_for_release', 'committed',
      'deferred', 'rejected', 'blocked_source_health', 'blocked_privacy',
      'blocked_conflict'
    )
  ),
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

create index if not exists mia_evolution_candidates_state_created_idx
  on public.mia_evolution_candidates (state, created_at);
create index if not exists mia_evolution_candidates_gene_type_idx
  on public.mia_evolution_candidates (gene_type, state, explicit_marked_at);

alter table public.mia_evolution_candidates enable row level security;
revoke all on public.mia_evolution_candidates from anon, authenticated;
grant select, insert, update on public.mia_evolution_candidates to service_role;

-- Before production use:
-- 1) Add an append-only transition/event table; do not rely only on mutable state.
-- 2) Add server-side state-transition validation and updated_at handling.
-- 3) Add privacy-safe evidence validation and opaque-pointer resolution in server-only code.
-- 4) Add explicit grants and test anon/authenticated denial.
-- 5) Do not apply this draft until schema compatibility and RLS/grants are reviewed.
