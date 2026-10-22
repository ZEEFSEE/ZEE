-- Additive regional stability oracle for ZHI World Builder.
-- Records validation samples and freezes a region at >=20 samples and >10% errors.
-- The freeze is sticky; no automatic resume or production world writes are enabled.

create table if not exists public.zhi_world_builder_region_samples (
  sample_id uuid primary key,
  region_key text not null,
  passed boolean not null,
  validation_code text not null default 'scene_validation',
  details jsonb not null default '{}'::jsonb,
  recorded_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists zhi_world_builder_region_samples_region_created_idx
  on public.zhi_world_builder_region_samples (region_key, created_at desc);
alter table public.zhi_world_builder_region_samples enable row level security;
revoke all on table public.zhi_world_builder_region_samples from public, anon, authenticated;
grant all on table public.zhi_world_builder_region_samples to service_role;

create or replace function public.zhi_world_builder_record_sample(
  p_sample_id uuid,
  p_region_key text,
  p_passed boolean,
  p_validation_code text,
  p_details jsonb,
  p_recorded_by text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sample_count integer;
  v_error_count integer;
  v_error_rate numeric;
  v_frozen boolean;
  v_inserted integer;
begin
  if p_sample_id is null or p_region_key is null or length(trim(p_region_key)) = 0
     or length(p_region_key) > 120 or p_passed is null then
    raise exception 'invalid_sample';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_region_key));

  insert into public.zhi_world_builder_region_samples
    (sample_id, region_key, passed, validation_code, details, recorded_by)
  values
    (p_sample_id, trim(p_region_key), p_passed,
     coalesce(nullif(left(p_validation_code, 80), ''), 'scene_validation'),
     coalesce(p_details, '{}'::jsonb), coalesce(nullif(p_recorded_by, ''), 'unknown'))
  on conflict (sample_id) do nothing;
  get diagnostics v_inserted = row_count;

  select count(*)::integer, count(*) filter (where not passed)::integer
    into v_sample_count, v_error_count
  from public.zhi_world_builder_region_samples
  where region_key = trim(p_region_key);

  v_error_rate := case when v_sample_count = 0 then 0
                       else v_error_count::numeric / v_sample_count end;

  insert into public.zhi_world_builder_region_health
    (region_key, sample_count, error_count, error_rate, frozen, freeze_reason, last_sample_at, updated_at)
  values
    (trim(p_region_key), v_sample_count, v_error_count, v_error_rate,
     (v_sample_count >= 20 and v_error_rate > 0.10),
     case when v_sample_count >= 20 and v_error_rate > 0.10
       then format('stability_threshold_exceeded: %s/%s errors (>10%%)', v_error_count, v_sample_count)
       else null end,
     now(), now())
  on conflict (region_key) do update set
    sample_count = excluded.sample_count,
    error_count = excluded.error_count,
    error_rate = excluded.error_rate,
    frozen = public.zhi_world_builder_region_health.frozen
             or (excluded.sample_count >= 20 and excluded.error_rate > 0.10),
    freeze_reason = case
      when public.zhi_world_builder_region_health.frozen then public.zhi_world_builder_region_health.freeze_reason
      when excluded.sample_count >= 20 and excluded.error_rate > 0.10 then excluded.freeze_reason
      else null end,
    last_sample_at = now(),
    updated_at = now();

  select frozen into v_frozen
  from public.zhi_world_builder_region_health
  where region_key = trim(p_region_key);

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted = 1,
    'region_key', trim(p_region_key),
    'sample_count', v_sample_count,
    'error_count', v_error_count,
    'error_rate', v_error_rate,
    'frozen', coalesce(v_frozen, false),
    'freeze_threshold', 'sample_count >= 20 AND error_rate > 0.10'
  );
end;
$$;

revoke all on function public.zhi_world_builder_record_sample(uuid,text,boolean,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.zhi_world_builder_record_sample(uuid,text,boolean,text,jsonb,text) to service_role;
