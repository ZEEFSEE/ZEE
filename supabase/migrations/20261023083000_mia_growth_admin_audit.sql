-- Mia growth manager-action audit, isolated in zee-extension.
create table if not exists public.mia_growth_admin_audit (
  audit_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null,
  action text not null,
  target_version bigint,
  restored_version bigint,
  manager_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.mia_growth_admin_audit enable row level security;
revoke all on public.mia_growth_admin_audit from anon, authenticated;
grant select, insert on public.mia_growth_admin_audit to service_role;
