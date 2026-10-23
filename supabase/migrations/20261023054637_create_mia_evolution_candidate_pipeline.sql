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
create or replace function public.mia_evolution_guard_candidate_transition()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.state <> 'candidate' then raise exception 'New evolution candidates must start in candidate state'; end if;
    new.updated_at := now();
    insert into public.mia_evolution_candidate_events
      (candidate_id, identity_id, from_state, to_state, actor, reason_code, reason_summary, idempotency_key)
    values (new.candidate_id, new.identity_id, null, 'candidate', 'mia-evolution-pipeline', 'candidate_created',
      'Candidate created; evidence and privacy checks have not yet passed.', 'candidate-created:' || new.candidate_id::text);
    return new;
  end if;
  if new.candidate_id <> old.candidate_id or new.identity_id <> old.identity_id
     or new.gene_type <> old.gene_type or new.memory_pointer <> old.memory_pointer
     or new.source_scope <> old.source_scope or new.explicit_marked_at <> old.explicit_marked_at then
    raise exception 'Immutable candidate identity/source fields cannot be changed';
  end if;
  if new.state is distinct from old.state then
    allowed :=
      (old.state='candidate' and new.state in ('evidence_check','deferred','rejected','blocked_source_health')) or
      (old.state='evidence_check' and new.state in ('stability_check','deferred','rejected','blocked_source_health')) or
      (old.state='stability_check' and new.state in ('privacy_review','deferred','rejected','blocked_source_health')) or
      (old.state='privacy_review' and new.state in ('contradiction_check','blocked_privacy','deferred','rejected')) or
      (old.state='contradiction_check' and new.state in ('human_review','blocked_conflict','deferred','rejected')) or
      (old.state='human_review' and new.state in ('approved_for_shadow','deferred','rejected')) or
      (old.state='approved_for_shadow' and new.state in ('shadow_observation','deferred','rejected')) or
      (old.state='shadow_observation' and new.state in ('approved_for_release','deferred','rejected','blocked_conflict')) or
      (old.state='approved_for_release' and new.state in ('committed','deferred','rejected')) or
      (old.state in ('deferred','blocked_source_health','blocked_privacy','blocked_conflict') and new.state in ('candidate','evidence_check','rejected')) or
      (old.state='rejected' and new.state='candidate');
    if not allowed then raise exception 'Invalid evolution state transition: % -> %', old.state, new.state; end if;
    new.updated_at := now();
    insert into public.mia_evolution_candidate_events
      (candidate_id, identity_id, from_state, to_state, actor, reason_code, reason_summary, idempotency_key)
    values (new.candidate_id, new.identity_id, old.state, new.state, 'mia-evolution-pipeline', 'state_transition',
      coalesce(new.reviewer_decision, 'State transition requested; review evidence separately.'),
      'state:' || new.candidate_id::text || ':' || old.state || ':' || new.state || ':' ||
      floor(extract(epoch from clock_timestamp()) * 1000000)::bigint::text);
  else new.updated_at := now();
  end if;
  return new;
end; $$;
create trigger mia_evolution_guard_candidate_transition
before insert or update on public.mia_evolution_candidates
for each row execute function public.mia_evolution_guard_candidate_transition();
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
