-- Additive ZHI World Builder sandbox schema for zee-extension.
-- Safe defaults: sandbox only, globally paused, no AIGC, no production writes,
-- and no real ZHI token movement. API access is service_role only.

create table if not exists public.zhi_world_builder_config (
  config_key text primary key default 'default' check (config_key = 'default'),
  gold_consensus numeric(5,4) not null default 0.4000 check (gold_consensus >= 0 and gold_consensus <= 1),
  yellow_vitality numeric(5,4) not null default 0.3000 check (yellow_vitality >= 0 and yellow_vitality <= 1),
  green_spontaneity numeric(5,4) not null default 0.3000 check (green_spontaneity >= 0 and green_spontaneity <= 1),
  profile_version text not null default 'aesthetic-profile-v1',
  sandbox_mode boolean not null default true,
  aigc_enabled boolean not null default false,
  production_writes_enabled boolean not null default false,
  global_paused boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'migration'
);

alter table public.zhi_world_builder_config enable row level security;
revoke all on table public.zhi_world_builder_config from public, anon, authenticated;
grant select, insert, update, delete on table public.zhi_world_builder_config to service_role;

insert into public.zhi_world_builder_config (config_key, gold_consensus, yellow_vitality, green_spontaneity, profile_version, sandbox_mode, aigc_enabled, production_writes_enabled, global_paused, updated_by)
values ('default', 0.4000, 0.3000, 0.3000, 'aesthetic-profile-v1', true, false, false, true, 'migration')
on conflict (config_key) do nothing;

create table if not exists public.zhi_world_builder_proposals (
  id uuid primary key default gen_random_uuid(),
  region_key text not null,
  proposal_type text not null default 'scene',
  title text not null,
  proposal jsonb not null default '{}'::jsonb,
  aesthetic_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed','simulated','accepted','rejected','frozen','rolled_back')),
  oracle_result jsonb not null default '{}'::jsonb,
  created_by text not null default 'mia',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  rollback_of uuid references public.zhi_world_builder_proposals(id),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_zhi_world_builder_proposals_region_time
  on public.zhi_world_builder_proposals (region_key, created_at desc);
create index if not exists idx_zhi_world_builder_proposals_status_time
  on public.zhi_world_builder_proposals (status, created_at desc);
alter table public.zhi_world_builder_proposals enable row level security;
revoke all on table public.zhi_world_builder_proposals from public, anon, authenticated;
grant select, insert, update, delete on table public.zhi_world_builder_proposals to service_role;

create table if not exists public.zhi_world_builder_region_health (
  region_key text primary key,
  sample_count integer not null default 0 check (sample_count >= 0),
  error_count integer not null default 0 check (error_count >= 0 and error_count <= sample_count),
  error_rate numeric(7,6) not null default 0 check (error_rate >= 0 and error_rate <= 1),
  frozen boolean not null default false,
  freeze_reason text,
  last_sample_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.zhi_world_builder_region_health enable row level security;
revoke all on table public.zhi_world_builder_region_health from public, anon, authenticated;
grant select, insert, update, delete on table public.zhi_world_builder_region_health to service_role;

create table if not exists public.zhi_world_builder_compute_ledger (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.zhi_world_builder_proposals(id),
  entry_type text not null check (entry_type in ('compute_simulated','stake_simulated','reward_simulated','burn_simulated')),
  amount numeric(20,6) not null default 0 check (amount >= 0),
  unit text not null default 'simulation_credit',
  is_simulation boolean not null default true check (is_simulation = true),
  actual_zhi_debit numeric(20,6) not null default 0 check (actual_zhi_debit = 0),
  actual_zhi_reward numeric(20,6) not null default 0 check (actual_zhi_reward = 0),
  actual_zhi_burn numeric(20,6) not null default 0 check (actual_zhi_burn = 0),
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_zhi_world_builder_ledger_proposal_time
  on public.zhi_world_builder_compute_ledger (proposal_id, created_at desc);
alter table public.zhi_world_builder_compute_ledger enable row level security;
revoke all on table public.zhi_world_builder_compute_ledger from public, anon, authenticated;
grant select, insert, update, delete on table public.zhi_world_builder_compute_ledger to service_role;

comment on table public.zhi_world_builder_config is 'ZHI World Builder controls; isolated additive module. Defaults remain sandboxed and paused.';
comment on table public.zhi_world_builder_proposals is 'Mia-generated world/scene proposals; proposal storage only, not a production world write.';
comment on table public.zhi_world_builder_region_health is 'Region stability monitor state; freeze decisions require application/oracle validation.';
comment on table public.zhi_world_builder_compute_ledger is 'Simulation-only compute/stake accounting. Actual ZHI token movements are structurally disabled by zero-only columns.';
