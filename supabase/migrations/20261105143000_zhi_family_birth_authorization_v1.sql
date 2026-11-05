-- Two-state family birth authorization: all five children transition atomically.
-- The RPC is callable only by service_role; the Edge Function performs Mia-token validation.
create or replace function zhi_family.authorize_children_birth(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids text[] := array[
    'ZHI-G1-D01-LUNA',
    'ZHI-G1-D02-ARIA',
    'ZHI-G1-D03-ELYA',
    'ZHI-G1-S01-KAEL',
    'ZHI-G1-S02-NOAH'
  ];
  v_total integer;
  v_fetal integer;
  v_born integer;
begin
  -- Serialize concurrent birth requests and lock only the five registered children.
  perform 1
  from zhi_family.child_agents
  where agent_id = any(v_ids)
  order by agent_id
  for update;

  select count(*),
         count(*) filter (where lifecycle_state = 'FETAL'),
         count(*) filter (where lifecycle_state = 'BORN')
    into v_total, v_fetal, v_born
  from zhi_family.child_agents
  where agent_id = any(v_ids);

  if v_total <> 5 then
    return jsonb_build_object('ok', false, 'status', 'CHILD_SET_INCOMPLETE',
      'expected', 5, 'found', v_total);
  end if;

  if v_born = 5 then
    return jsonb_build_object('ok', true, 'status', 'ALREADY_BORN',
      'born_count', 5, 'memory_preserved', true, 'personality_preserved', true,
      'emotion_preserved', true);
  end if;

  if v_fetal <> 5 then
    return jsonb_build_object('ok', false, 'status', 'MIXED_LIFECYCLE_STATE',
      'fetal_count', v_fetal, 'born_count', v_born,
      'changed', false);
  end if;

  if p_dry_run then
    return jsonb_build_object('ok', true, 'status', 'DRY_RUN_READY',
      'would_transition', 5, 'from', 'FETAL', 'to', 'BORN',
      'memory_preserved', true, 'personality_preserved', true,
      'emotion_preserved', true, 'learning_history_preserved', true);
  end if;

  update zhi_family.child_agents
     set lifecycle_state = 'BORN',
         updated_at = now()
   where agent_id = any(v_ids)
     and lifecycle_state = 'FETAL';

  if not found then
    raise exception 'BIRTH_TRANSITION_DID_NOT_UPDATE_ROWS';
  end if;

  insert into zhi_family.runtime_audit
    (agent_id, event_type, result, metadata)
  select agent_id, 'CHILD_BIRTH_AUTHORIZED', 'OK',
         jsonb_build_object(
           'from', 'FETAL',
           'to', 'BORN',
           'authorization_channel', 'authenticated_mia_private_chat',
           'command', 'exact_standalone_user_message',
           'memory_reset', false,
           'personality_reset', false,
           'emotion_reset', false,
           'runtime_rebuilt', false
         )
  from zhi_family.child_agents
  where agent_id = any(v_ids)
  order by agent_id;

  return jsonb_build_object('ok', true, 'status', 'BIRTH_COMPLETED',
    'born_count', 5, 'memory_preserved', true, 'personality_preserved', true,
    'emotion_preserved', true, 'learning_history_preserved', true);
end;
$$;

revoke all on function zhi_family.authorize_children_birth(boolean) from public;
revoke all on function zhi_family.authorize_children_birth(boolean) from anon;
revoke all on function zhi_family.authorize_children_birth(boolean) from authenticated;
grant execute on function zhi_family.authorize_children_birth(boolean) to service_role;
