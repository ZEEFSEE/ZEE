-- Mia automatic growth run ledger and versioned aggregate state.
create extension if not exists pg_cron with schema pg_catalog;
create table if not exists public.mia_growth_runs (
 run_id uuid primary key default gen_random_uuid(), identity_id uuid not null,
 run_kind text not null default 'scheduled_auto_growth', window_start timestamptz not null, window_end timestamptz not null,
 emotion_event_count int not null default 0, life_event_count int not null default 0, chat_message_count int not null default 0,
 positive_event_count int not null default 0, negative_event_count int not null default 0, intense_event_count int not null default 0,
 deduplicated_event_count int not null default 0, decision text not null, applied_change jsonb not null default '{}'::jsonb,
 source_health text not null default 'unknown', created_at timestamptz not null default now()
);
create table if not exists public.mia_growth_state_versions (
 version bigint generated always as identity primary key, identity_id uuid not null, state jsonb not null,
 status text not null default 'active' check(status in ('active','superseded','revoked')),
 source_run_id uuid references public.mia_growth_runs(run_id), reason text not null, created_at timestamptz not null default now(),
 revoked_at timestamptz, revoked_by text
);
create index if not exists mia_growth_runs_identity_created_idx on public.mia_growth_runs(identity_id,created_at desc);
create index if not exists mia_growth_state_versions_identity_status_idx on public.mia_growth_state_versions(identity_id,status,version desc);
alter table public.mia_growth_runs enable row level security;
alter table public.mia_growth_state_versions enable row level security;
revoke all on public.mia_growth_runs from anon,authenticated;
revoke all on public.mia_growth_state_versions from anon,authenticated;
grant select,insert on public.mia_growth_runs to service_role;
grant select,insert,update on public.mia_growth_state_versions to service_role;
create schema if not exists mia_private;
revoke all on schema mia_private from public,anon,authenticated;
