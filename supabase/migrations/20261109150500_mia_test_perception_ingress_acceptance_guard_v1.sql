create or replace function mia_test.guard_perception_ingress_acceptance()
returns trigger
language plpgsql
set search_path = pg_catalog, mia_test
as $$
declare
  src record;
begin
  select enabled, revoked_at, max_age_seconds, max_clock_skew_seconds, allowed_frame_ids
    into src
  from mia_test.perception_source_registry
  where source_id = new.source_id;

  if not found then
    raise exception 'perception_source_not_registered' using errcode = '23514';
  end if;

  if new.disposition = 'accepted' then
    if src.enabled is not true or src.revoked_at is not null then
      raise exception 'perception_source_not_active' using errcode = '23514';
    end if;
    if not (new.frame_id = any(src.allowed_frame_ids)) then
      raise exception 'perception_frame_not_allowlisted' using errcode = '23514';
    end if;
    if new.observed_at > now() + make_interval(secs => src.max_clock_skew_seconds) then
      raise exception 'perception_timestamp_future_skew' using errcode = '23514';
    end if;
    if new.observed_at < now() - make_interval(secs => src.max_age_seconds) then
      raise exception 'perception_observation_stale' using errcode = '23514';
    end if;
    if new.signature_status <> 'verified' or new.freshness_status <> 'fresh' then
      raise exception 'perception_signature_or_freshness_unverified' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function mia_test.guard_perception_ingress_acceptance() from public, anon, authenticated;
grant execute on function mia_test.guard_perception_ingress_acceptance() to service_role;

drop trigger if exists perception_ingress_acceptance_guard on mia_test.perception_ingress_events;
create trigger perception_ingress_acceptance_guard
before insert or update on mia_test.perception_ingress_events
for each row execute function mia_test.guard_perception_ingress_acceptance();
