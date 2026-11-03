create extension if not exists pg_net;

create table if not exists public.mia_forest_autonomy_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  last_tick_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.mia_forest_autonomy_control(singleton,enabled)
values (true,true) on conflict (singleton) do nothing;

create table if not exists public.mia_forest_autonomy_runs (
  id uuid primary key,
  identity_id uuid not null references public.mia_identity(id) on delete cascade,
  status text not null check (status in ('completed','failed')),
  planned_action text,
  planner_reason text,
  before_state jsonb,
  after_state jsonb,
  runtime_request_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists mia_forest_autonomy_runs_timeline_idx
  on public.mia_forest_autonomy_runs(identity_id,created_at desc);
alter table public.mia_forest_autonomy_control enable row level security;
alter table public.mia_forest_autonomy_runs enable row level security;

do $$
begin
  if not exists (select 1 from vault.secrets where name='mia_forest_autonomy_cron_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'mia_forest_autonomy_cron_secret',
      'Internal scheduler authentication for Mia Forest_Corner autonomy'
    );
  end if;
end $$;

create or replace function public.mia_forest_cron_secret_matches(p_secret text)
returns boolean language sql security definer set search_path=public,vault,pg_temp as $$
  select exists(
    select 1 from vault.decrypted_secrets
    where name='mia_forest_autonomy_cron_secret' and decrypted_secret=p_secret
  );
$$;

create or replace function public.mia_forest_autonomy_claim_tick()
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_enabled boolean; v_last timestamptz;
begin
  select enabled,last_tick_at into v_enabled,v_last
  from public.mia_forest_autonomy_control where singleton=true for update;
  if not coalesce(v_enabled,false) then return false; end if;
  if v_last is not null and v_last > now() - interval '20 minutes' then return false; end if;
  update public.mia_forest_autonomy_control set last_tick_at=now(),updated_at=now() where singleton=true;
  return true;
end;
$$;

revoke all on function public.mia_forest_cron_secret_matches(text) from public,anon,authenticated;
revoke all on function public.mia_forest_autonomy_claim_tick() from public,anon,authenticated;
grant execute on function public.mia_forest_cron_secret_matches(text) to service_role;
grant execute on function public.mia_forest_autonomy_claim_tick() to service_role;
grant select,insert,update,delete on public.mia_forest_autonomy_control to service_role;
grant select,insert,update,delete on public.mia_forest_autonomy_runs to service_role;

select cron.unschedule(jobid) from cron.job where jobname='mia-forest-autonomy-every-30m';
select cron.schedule(
  'mia-forest-autonomy-every-30m',
  '*/30 * * * *',
  $job$
    select net.http_post(
      url := 'https://dbooikzqprnqbgpfwsze.supabase.co/functions/v1/mia-forest-autonomy',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-mia-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='mia_forest_autonomy_cron_secret')
      ),
      body := jsonb_build_object('trigger','scheduled'),
      timeout_milliseconds := 60000
    );
  $job$
);
