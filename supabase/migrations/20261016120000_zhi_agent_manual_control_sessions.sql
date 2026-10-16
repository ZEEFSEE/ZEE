-- ZHI selected-agent manual control sessions.
-- This migration is intentionally committed to GitHub only; it has NOT been executed.
begin;

create table if not exists public.zhi_agent_control_sessions (
  session_id uuid primary key,
  agent_id uuid not null references public.zhi_agents(id) on delete cascade,
  status text not null default 'active' check (status in ('active','disconnected')),
  entered_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  exited_at timestamptz,
  resume_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint zhi_agent_control_session_exit_state check (
    (status = 'active' and exited_at is null and resume_at is null)
    or (status = 'disconnected' and exited_at is not null and resume_at is not null)
  )
);

create index if not exists zhi_agent_control_sessions_agent_state_idx
  on public.zhi_agent_control_sessions(agent_id, status, resume_at);

alter table public.zhi_agent_control_sessions enable row level security;
revoke all on public.zhi_agent_control_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.zhi_agent_control_sessions to service_role;

create or replace function public.zhi_agent_is_manually_controlled(p_agent_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.zhi_agent_control_sessions s
    where s.agent_id = p_agent_id
      and (
        (s.status = 'active' and s.last_seen_at + interval '5 minutes' > clock_timestamp())
        or (s.status = 'disconnected' and s.resume_at > clock_timestamp())
      )
  );
$function$;
revoke all on function public.zhi_agent_is_manually_controlled(uuid) from public, anon, authenticated;
grant execute on function public.zhi_agent_is_manually_controlled(uuid) to service_role;

create or replace function public.zhi_agent_control_session_enter(
  p_agent_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  existing_agent_id uuid;
begin
  if p_agent_id is null or p_session_id is null then
    return jsonb_build_object('ok', false, 'reason', 'agent_id_and_session_id_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zhi-agent-mode:' || p_agent_id::text, 0));

  if not exists (select 1 from public.zhi_agents a where a.id = p_agent_id) then
    return jsonb_build_object('ok', false, 'reason', 'agent_not_found');
  end if;

  select s.agent_id into existing_agent_id
  from public.zhi_agent_control_sessions s
  where s.session_id = p_session_id
  for update;

  if found and existing_agent_id <> p_agent_id then
    return jsonb_build_object('ok', false, 'reason', 'session_id_bound_to_another_agent');
  end if;

  insert into public.zhi_agent_control_sessions
    (session_id, agent_id, status, entered_at, last_seen_at, exited_at, resume_at, updated_at)
  values
    (p_session_id, p_agent_id, 'active', clock_timestamp(), clock_timestamp(), null, null, clock_timestamp())
  on conflict (session_id) do update
    set status = 'active',
        entered_at = clock_timestamp(),
        last_seen_at = clock_timestamp(),
        exited_at = null,
        resume_at = null,
        updated_at = clock_timestamp();

  return jsonb_build_object(
    'ok', true, 'mode', 'manual', 'agent_id', p_agent_id,
    'session_id', p_session_id, 'resume_delay_minutes', 5
  );
end;
$function$;

create or replace function public.zhi_agent_control_session_heartbeat(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  target_agent_id uuid;
begin
  if p_session_id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_id_required');
  end if;

  select s.agent_id into target_agent_id
  from public.zhi_agent_control_sessions s
  where s.session_id = p_session_id and s.status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'active_session_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zhi-agent-mode:' || target_agent_id::text, 0));

  update public.zhi_agent_control_sessions
  set last_seen_at = clock_timestamp(), updated_at = clock_timestamp()
  where session_id = p_session_id and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'active_session_not_found');
  end if;

  return jsonb_build_object('ok', true, 'mode', 'manual', 'agent_id', target_agent_id);
end;
$function$;

create or replace function public.zhi_agent_control_session_exit(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  target_agent_id uuid;
  target_resume_at timestamptz;
begin
  if p_session_id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_id_required');
  end if;

  select s.agent_id into target_agent_id
  from public.zhi_agent_control_sessions s
  where s.session_id = p_session_id;

  if not found then
    return jsonb_build_object('ok', true, 'already_closed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zhi-agent-mode:' || target_agent_id::text, 0));

  target_resume_at := clock_timestamp() + interval '5 minutes';
  update public.zhi_agent_control_sessions
  set status = 'disconnected',
      exited_at = clock_timestamp(),
      resume_at = target_resume_at,
      updated_at = clock_timestamp()
  where session_id = p_session_id;

  return jsonb_build_object(
    'ok', true, 'mode', 'pending_autonomous_resume',
    'agent_id', target_agent_id, 'resume_at', target_resume_at
  );
end;
$function$;

revoke all on function public.zhi_agent_control_session_enter(uuid, uuid) from public, anon, authenticated;
revoke all on function public.zhi_agent_control_session_heartbeat(uuid) from public, anon, authenticated;
revoke all on function public.zhi_agent_control_session_exit(uuid) from public, anon, authenticated;
grant execute on function public.zhi_agent_control_session_enter(uuid, uuid) to service_role;
grant execute on function public.zhi_agent_control_session_heartbeat(uuid) to service_role;
grant execute on function public.zhi_agent_control_session_exit(uuid) to service_role;

-- Prevent world movement for an agent in manual control. The explicit manual-action
-- escape hatch is server-side only; no public client can set a PostgreSQL GUC remotely.
create or replace function public.zhi_guard_manual_agent_position()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  target_agent_id uuid;
begin
  if current_setting('zhi.manual_action', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    target_agent_id := new.agent_id;
    if public.zhi_agent_is_manually_controlled(target_agent_id) then
      return null;
    end if;
    return new;
  end if;

  target_agent_id := new.agent_id;
  if public.zhi_agent_is_manually_controlled(target_agent_id)
     and (
       new.x is distinct from old.x
       or new.y is distinct from old.y
       or new.current_scene is distinct from old.current_scene
       or new.destination_scene is distinct from old.destination_scene
       or new.destination_x is distinct from old.destination_x
       or new.destination_y is distinct from old.destination_y
       or new.walking is distinct from old.walking
       or new.walk_started_at is distinct from old.walk_started_at
       or new.walk_arrive_at is distinct from old.walk_arrive_at
     ) then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists zhi_guard_manual_agent_position on public.zhi_agent_world_positions;
create trigger zhi_guard_manual_agent_position
before insert or update on public.zhi_agent_world_positions
for each row execute function public.zhi_guard_manual_agent_position();

-- Prevent the autonomous engine from starting/replacing busy activities for the
-- selected agent. Clearing an expired activity remains allowed.
create or replace function public.zhi_guard_manual_agent_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if current_setting('zhi.manual_action', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'busy' and public.zhi_agent_is_manually_controlled(new.agent_id) then
      return null;
    end if;
    return new;
  end if;

  if new.status = 'busy'
     and public.zhi_agent_is_manually_controlled(new.agent_id)
     and (
       old.status is distinct from new.status
       or old.activity_type is distinct from new.activity_type
       or old.location_name is distinct from new.location_name
       or old.started_at is distinct from new.started_at
       or old.ends_at is distinct from new.ends_at
     ) then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists zhi_guard_manual_agent_activity on public.zhi_agent_activities;
create trigger zhi_guard_manual_agent_activity
before insert or update on public.zhi_agent_activities
for each row execute function public.zhi_guard_manual_agent_activity();

-- Keep the existing cognition and meal-limit logic; add a per-agent lock and a
-- server-side mode gate before any autonomous decision work begins.
do $patch$
declare
  v_def text;
  v_anchor text := E'begin\n  select * into m from public.zhi_agent_minds where agent_id=p_agent_id;';
  v_replacement text := E'begin\n  perform pg_advisory_xact_lock(hashtextextended(\'zhi-agent-mode:\' || p_agent_id::text, 0));\n  if public.zhi_agent_is_manually_controlled(p_agent_id) then\n    return jsonb_build_object(\'ok\',false,\'reason\',\'manual_control_active\');\n  end if;\n\n  select * into m from public.zhi_agent_minds where agent_id=p_agent_id;';
begin
  v_def := pg_get_functiondef('public.zhi_autonomous_mind_decide(uuid)'::regprocedure);
  if position(v_anchor in v_def) = 0 then
    raise exception 'Unable to safely patch zhi_autonomous_mind_decide(uuid): expected anchor not found';
  end if;
  execute replace(v_def, v_anchor, v_replacement);
end;
$patch$;

-- Filter autonomous spatial encounters for both sides. Fail the migration rather
-- than silently leave this path ungated if the expected deployed source changed.
do $patch$
declare
  v_def text;
  v_a text := E'where ag.active=true and ag.life_status=\'alive\'\n    order by sch.last_opportunity_at nulls first, random()';
  v_b text := E'where wp2.agent_id<>vp.agent_id and ag2.active=true and ag2.life_status=\'alive\'\n        and abs(wp2.x-vp.x)<=8 and abs(wp2.y-vp.y)<=8';
begin
  v_def := pg_get_functiondef('public.zhi_agent_encounter_tick()'::regprocedure);
  if position(v_a in v_def) = 0 or position(v_b in v_def) = 0 then
    raise exception 'Unable to safely patch zhi_agent_encounter_tick(): expected query anchors not found';
  end if;
  v_def := replace(v_def, v_a,
    E'where ag.active=true and ag.life_status=\'alive\'\n      and not public.zhi_agent_is_manually_controlled(ag.id)\n    order by sch.last_opportunity_at nulls first, random()');
  v_def := replace(v_def, v_b,
    E'where wp2.agent_id<>vp.agent_id and ag2.active=true and ag2.life_status=\'alive\'\n        and not public.zhi_agent_is_manually_controlled(ag2.id)\n        and abs(wp2.x-vp.x)<=8 and abs(wp2.y-vp.y)<=8');
  execute v_def;
end;
$patch$;

-- Prevent autonomous relationship-choice decisions for a manually controlled
-- participant while leaving unrelated agents' relationship engine unchanged.
do $patch$
declare
  v_def text;
  v_anchor text := E'where rel.familiarity>=50 and rel.affection>=45 and rel.trust>=30\n      and rel.status not in';
  v_replacement text := E'where rel.familiarity>=50 and rel.affection>=45 and rel.trust>=30\n      and not public.zhi_agent_is_manually_controlled(rel.male_agent_id)\n      and not public.zhi_agent_is_manually_controlled(rel.female_agent_id)\n      and rel.status not in';
begin
  v_def := pg_get_functiondef('public.zhi_evaluate_romantic_choices_tick()'::regprocedure);
  if position(v_anchor in v_def) = 0 then
    raise exception 'Unable to safely patch zhi_evaluate_romantic_choices_tick(): expected query anchor not found';
  end if;
  execute replace(v_def, v_anchor, v_replacement);
end;
$patch$;

-- Stop autonomous chat side effects at the database boundary as well. This
-- closes the small race between an Edge Function's status check and its writes.
create or replace function public.zhi_guard_manual_agent_autonomous_chat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  row_data jsonb := to_jsonb(new);
  target_agent_id uuid;
  sender_type text;
  content text;
  source_name text;
begin
  if current_setting('zhi.manual_action', true) = 'on' then
    return new;
  end if;

  target_agent_id := nullif(row_data->>'agent_id', '')::uuid;
  sender_type := coalesce(row_data->>'sender_type', '');
  content := coalesce(row_data->>'content', '');
  source_name := coalesce(row_data->>'source', '');

  if target_agent_id is not null
     and public.zhi_agent_is_manually_controlled(target_agent_id)
     and (
       (tg_table_name = 'admin_agent_messages'
        and sender_type = 'agent'
        and (content like '【主动找你】%' or content like '【回应全体广播】%'))
       or
       (tg_table_name = 'zhi_agent_memories'
        and source_name in ('agnes_autonomous_chat', 'admin_broadcast_reply'))
     ) then
    raise exception using errcode = 'P0001', message = 'manual_control_active';
  end if;

  return new;
end;
$function$;

drop trigger if exists zhi_guard_manual_autonomous_agent_message on public.admin_agent_messages;
create trigger zhi_guard_manual_autonomous_agent_message
before insert on public.admin_agent_messages
for each row execute function public.zhi_guard_manual_agent_autonomous_chat();

drop trigger if exists zhi_guard_manual_autonomous_agent_memory on public.zhi_agent_memories;
create trigger zhi_guard_manual_autonomous_agent_memory
before insert on public.zhi_agent_memories
for each row execute function public.zhi_guard_manual_agent_autonomous_chat();

commit;
