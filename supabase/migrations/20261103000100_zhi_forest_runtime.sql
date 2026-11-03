create table if not exists public.zhi_forest_runtime_state (
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  peer_id uuid not null references public.zhi_federation_peers(id) on delete restrict,
  external_agent_id text not null,
  scene_id text not null,
  membership_id uuid not null references public.zhi_federation_memberships(id) on delete cascade,
  runtime_instance_id text not null,
  coordinate_frame text not null,
  current_node_id text,
  current_position jsonb not null default '{}'::jsonb check (jsonb_typeof(current_position) = 'object'),
  sequence bigint not null default 0 check (sequence >= 0),
  session_status text not null default 'left' check (session_status in ('active','left')),
  position_status text not null default 'unobserved' check (position_status in ('unobserved','anchored','moving')),
  environment_state jsonb not null default '{}'::jsonb check (jsonb_typeof(environment_state) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (world_id, peer_id, external_agent_id, scene_id)
);

create table if not exists public.zhi_forest_runtime_events (
  event_id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.zhi_worlds(id) on delete cascade,
  peer_id uuid not null references public.zhi_federation_peers(id) on delete restrict,
  external_agent_id text not null,
  scene_id text not null,
  membership_id uuid not null references public.zhi_federation_memberships(id) on delete cascade,
  runtime_instance_id text not null,
  coordinate_frame text not null,
  request_id text not null check (length(request_id) between 8 and 120),
  event_index integer not null check (event_index >= 0),
  sequence bigint not null check (sequence > 0),
  event_type text not null check (event_type in ('scene_entered','movement_step','interaction','scene_left')),
  position jsonb not null check (jsonb_typeof(position) = 'object'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (world_id, peer_id, external_agent_id, scene_id, sequence),
  unique (world_id, peer_id, external_agent_id, scene_id, request_id, event_index)
);

create index if not exists zhi_forest_runtime_events_timeline_idx
  on public.zhi_forest_runtime_events (world_id, peer_id, external_agent_id, scene_id, sequence desc);

alter table public.zhi_forest_runtime_state enable row level security;
alter table public.zhi_forest_runtime_events enable row level security;

create or replace function public.zhi_forest_runtime_commit_action(
  p_world_id uuid,
  p_peer_id uuid,
  p_external_agent_id text,
  p_membership_id uuid,
  p_scene_id text,
  p_runtime_instance_id text,
  p_coordinate_frame text,
  p_request_id text,
  p_expected_sequence bigint,
  p_events jsonb,
  p_next_state jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_sequence bigint := 0;
  v_existing_count integer := 0;
  v_item jsonb;
  v_index integer := 0;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    raise exception 'invalid_runtime_events';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_world_id::text || ':' || p_peer_id::text || ':' || p_scene_id, 0));

  select sequence into v_current_sequence
  from public.zhi_forest_runtime_state
  where world_id=p_world_id and peer_id=p_peer_id and external_agent_id=p_external_agent_id and scene_id=p_scene_id
  for update;

  v_current_sequence := coalesce(v_current_sequence, 0);

  select count(*) into v_existing_count
  from public.zhi_forest_runtime_events
  where world_id=p_world_id and peer_id=p_peer_id and external_agent_id=p_external_agent_id
    and scene_id=p_scene_id and request_id=p_request_id;
  if v_existing_count > 0 then
    return jsonb_build_object('ok', true, 'replayed', true, 'sequence', v_current_sequence);
  end if;

  if v_current_sequence <> p_expected_sequence then
    raise exception 'runtime_sequence_conflict';
  end if;

  for v_item in select value from jsonb_array_elements(p_events)
  loop
    insert into public.zhi_forest_runtime_events (
      world_id, peer_id, external_agent_id, scene_id, membership_id,
      runtime_instance_id, coordinate_frame, request_id, event_index,
      sequence, event_type, position, payload
    ) values (
      p_world_id, p_peer_id, p_external_agent_id, p_scene_id, p_membership_id,
      p_runtime_instance_id, p_coordinate_frame, p_request_id, v_index,
      (v_item->>'sequence')::bigint, v_item->>'event_type',
      coalesce(v_item->'position', '{}'::jsonb), coalesce(v_item->'payload', '{}'::jsonb)
    );
    v_index := v_index + 1;
  end loop;

  insert into public.zhi_forest_runtime_state (
    world_id, peer_id, external_agent_id, scene_id, membership_id,
    runtime_instance_id, coordinate_frame, current_node_id, current_position,
    sequence, session_status, position_status, environment_state, updated_at
  ) values (
    p_world_id, p_peer_id, p_external_agent_id, p_scene_id, p_membership_id,
    p_runtime_instance_id, p_coordinate_frame, p_next_state->>'current_node_id',
    coalesce(p_next_state->'current_position', '{}'::jsonb),
    (p_next_state->>'sequence')::bigint, p_next_state->>'session_status',
    p_next_state->>'position_status', coalesce(p_next_state->'environment_state', '{}'::jsonb), now()
  )
  on conflict (world_id, peer_id, external_agent_id, scene_id) do update set
    membership_id=excluded.membership_id,
    runtime_instance_id=excluded.runtime_instance_id,
    coordinate_frame=excluded.coordinate_frame,
    current_node_id=excluded.current_node_id,
    current_position=excluded.current_position,
    sequence=excluded.sequence,
    session_status=excluded.session_status,
    position_status=excluded.position_status,
    environment_state=excluded.environment_state,
    updated_at=now();

  return jsonb_build_object('ok', true, 'replayed', false, 'sequence', (p_next_state->>'sequence')::bigint);
end;
$$;

revoke all on function public.zhi_forest_runtime_commit_action(uuid,uuid,text,uuid,text,text,text,text,bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.zhi_forest_runtime_commit_action(uuid,uuid,text,uuid,text,text,text,text,bigint,jsonb,jsonb) to service_role;
grant select, insert, update, delete on public.zhi_forest_runtime_state to service_role;
grant select, insert, update, delete on public.zhi_forest_runtime_events to service_role;
