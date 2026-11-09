create or replace function zhi_family.capture_mia_cim_checkpoint()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, zhi_family, public
as $$
declare
  v_identity uuid := 'cb6d01b4-0e3f-46ee-8946-360aa91db1ea';
  v_watermarks jsonb;
  v_manifest jsonb;
  v_last_watermarks jsonb;
  v_snapshot_no bigint;
  v_snapshot_id uuid;
  v_hash text;
begin
  perform pg_advisory_xact_lock(0, hashtext('zhi_family.mia_cim_periodic_checkpoint'));

  select jsonb_build_object(
    'mia_memories_count', (select count(*) from public.mia_memories where identity_id=v_identity),
    'mia_memories_max_created_at', (select max(created_at) from public.mia_memories where identity_id=v_identity),
    'mia_life_events_count', (select count(*) from public.mia_life_events where identity_id=v_identity),
    'mia_life_events_max_created_at', (select max(created_at) from public.mia_life_events where identity_id=v_identity),
    'mia_emotion_events_count', (select count(*) from public.mia_emotion_events where identity_id=v_identity),
    'mia_emotion_events_max_created_at', (select max(created_at) from public.mia_emotion_events where identity_id=v_identity),
    'mia_personality_state_count', (select count(*) from public.mia_personality_state where identity_id=v_identity),
    'mia_personality_state_max_observed_at', (select max(observed_at) from public.mia_personality_state where identity_id=v_identity),
    'mia_relationship_context_count', (select count(*) from public.mia_relationship_context where identity_id=v_identity),
    'mia_relationship_context_max_observed_at', (select max(observed_at) from public.mia_relationship_context where identity_id=v_identity),
    'memory_events_v2_count', (select count(*) from zhi_family.memory_events_v2 where scope='MIA' and owner_id=v_identity::text),
    'memory_events_v2_max_recorded_at', (select max(recorded_at) from zhi_family.memory_events_v2 where scope='MIA' and owner_id=v_identity::text),
    'cim_sync_event_count', (select count(*) from zhi_family.cim_sync_events where identity_id=v_identity),
    'cim_sync_latest_seq', (select coalesce(max(sync_seq),0) from zhi_family.cim_sync_events where identity_id=v_identity),
    'active_device_count', (select count(*) from zhi_family.cim_device_registry where identity_id=v_identity and revoked_at is null)
  ) into v_watermarks;

  select source_watermarks into v_last_watermarks
  from zhi_family.cim_state_snapshots
  where identity_id=v_identity
  order by snapshot_no desc
  limit 1;

  if v_last_watermarks is not null and v_last_watermarks = v_watermarks then
    return jsonb_build_object('ok',true,'created',false,'reason','unchanged','source_watermarks',v_watermarks);
  end if;

  select coalesce(max(snapshot_no),0)+1 into v_snapshot_no
  from zhi_family.cim_state_snapshots
  where identity_id=v_identity;

  v_manifest := jsonb_build_object(
    'schema_version','2.0',
    'identity_id',v_identity,
    'display_name','Mia',
    'checkpoint_type','metadata_only',
    'content_policy','no_message_or_memory_content_copied',
    'captured_at',clock_timestamp()
  );
  v_hash := encode(extensions.digest(convert_to(v_watermarks::text,'UTF8'),'sha256'),'hex');

  insert into zhi_family.cim_state_snapshots
    (identity_id,snapshot_no,snapshot_kind,state_manifest,source_watermarks,content_sha256)
  values
    (v_identity,v_snapshot_no,'PERIODIC',v_manifest,v_watermarks,v_hash)
  returning snapshot_id into v_snapshot_id;

  return jsonb_build_object(
    'ok',true,'created',true,'snapshot_id',v_snapshot_id,
    'snapshot_no',v_snapshot_no,'content_sha256',v_hash,
    'source_watermarks',v_watermarks
  );
end;
$$;

revoke all on function zhi_family.capture_mia_cim_checkpoint() from public, anon, authenticated;
grant execute on function zhi_family.capture_mia_cim_checkpoint() to postgres;

select cron.schedule(
  'mia-cim-periodic-checkpoint',
  '*/30 * * * *',
  'select zhi_family.capture_mia_cim_checkpoint();'
);
