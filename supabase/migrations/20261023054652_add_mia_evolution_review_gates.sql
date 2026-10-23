alter table public.mia_evolution_candidates
  add column if not exists source_verification_status text not null default 'pending'
    check (source_verification_status in ('pending','verified','failed')),
  add column if not exists source_verified_by text,
  add column if not exists source_verified_at timestamptz,
  add column if not exists shadow_eval_status text not null default 'not_run'
    check (shadow_eval_status in ('not_run','passed','failed','inconclusive')),
  add column if not exists shadow_eval_summary text,
  add column if not exists shadow_eval_version text,
  add column if not exists release_approved_by text,
  add column if not exists released_at timestamptz;
