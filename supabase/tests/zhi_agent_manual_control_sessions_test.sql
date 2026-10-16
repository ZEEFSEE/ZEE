-- Transactional regression test for ZHI per-agent manual control.
-- Run only in an isolated test database after applying the migration.
begin;

do $test$
declare
  v_agent_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_before_x numeric;
  v_after_x numeric;
  v_result jsonb;
  v_manual boolean;
  v_decision jsonb;
begin
  select p.agent_id, p.x
    into v_agent_id, v_before_x
  from public.zhi_agent_world_positions p
  join public.zhi_agents a on a.id = p.agent_id
  where p.x is not null and p.y is not null
  order by p.agent_id
  limit 1;

  if v_agent_id is null then
    raise exception 'Test fixture required: at least one agent with a world position';
  end if;

  v_result := public.zhi_agent_control_session_enter(v_agent_id, v_session_id);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'enter failed: %', v_result;
  end if;

  v_manual := public.zhi_agent_is_manually_controlled(v_agent_id);
  if v_manual is not true then
    raise exception 'agent must enter manual mode immediately';
  end if;

  v_result := public.zhi_agent_control_session_heartbeat(v_session_id);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'heartbeat failed: %', v_result;
  end if;

  v_decision := public.zhi_autonomous_mind_decide(v_agent_id);
  if coalesce((v_decision->>'reason'), '') <> 'manual_control_active' then
    raise exception 'autonomous decision was not blocked: %', v_decision;
  end if;

  update public.zhi_agent_world_positions
  set x = x + 1
  where agent_id = v_agent_id;

  select x into v_after_x
  from public.zhi_agent_world_positions
  where agent_id = v_agent_id;

  if v_after_x is distinct from v_before_x then
    raise exception 'world movement was not blocked during manual control';
  end if;

  v_result := public.zhi_agent_control_session_exit(v_session_id);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'exit failed: %', v_result;
  end if;

  if public.zhi_agent_is_manually_controlled(v_agent_id) is not true then
    raise exception 'agent must remain in manual/grace mode for five minutes after exit';
  end if;

  update public.zhi_agent_control_sessions
  set resume_at = clock_timestamp() - interval '1 second'
  where session_id = v_session_id;

  if public.zhi_agent_is_manually_controlled(v_agent_id) is true then
    raise exception 'expired grace period should restore autonomous mode';
  end if;
end;
$test$;

rollback;
