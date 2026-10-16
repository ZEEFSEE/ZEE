-- ZHI Intimacy Park closed-loop hardening
-- Server-side attendance -> sexual desire -> emotion/memory/timeline feedback.
-- Adult eligibility: legacy agents without birth records follow the existing project convention.

create or replace function public.zhi_agent_sexual_desire_before_write()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_gender text;
  v_born_at timestamptz;
  v_energy numeric;
  v_mood numeric;
  v_stress numeric;
  v_social numeric;
  v_increment numeric := 0.50;
  v_is_minor boolean := false;
begin
  select a.gender, m.energy, m.mood, m.stress, a.social
    into v_gender, v_energy, v_mood, v_stress, v_social
  from public.zhi_agents a
  left join public.zhi_agent_minds m on m.agent_id=a.id
  where a.id=new.agent_id and a.active=true and a.life_status='alive';

  if v_gender not in ('男','女') or v_gender is null then
    new.sexual_desire := 0;
    return new;
  end if;

  select f.born_at into v_born_at
  from public.zhi_agent_family f where f.child_agent_id=new.agent_id
  limit 1;

  if found and (v_born_at is null or v_born_at > now()-interval '20 days') then
    v_is_minor := true;
  end if;

  if v_is_minor then
    new.sexual_desire := 0;
    return new;
  end if;

  if current_setting('zhi.intimacy_park_override', true) = 'on' then
    new.sexual_desire := least(100,greatest(coalesce(old.sexual_desire,40),coalesce(new.sexual_desire,40)));
    return new;
  end if;

  if tg_op='INSERT' then
    new.sexual_desire := least(100,greatest(40,coalesce(new.sexual_desire,40)));
  else
    v_increment := 0.50
      + least(0.25,greatest(0,coalesce(v_social,50)-50)*0.005)
      + least(0.25,greatest(0,coalesce(v_mood,50)-50)*0.005)
      - least(0.40,greatest(0,35-coalesce(v_energy,50))*0.01)
      - least(0.40,greatest(0,coalesce(v_stress,20)-65)*0.01);
    new.sexual_desire := least(100,greatest(40,coalesce(old.sexual_desire,40)+greatest(0.05,v_increment)));
  end if;
  return new;
end;
$function$;

create or replace function public.zhi_intimacy_park_attend(p_agent_id uuid, p_program_id text, p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_agent public.zhi_agents%rowtype;
  v_before numeric(5,2) := 0;
  v_after numeric(5,2) := 0;
  v_is_adult boolean := false;
  v_program public.zhi_intimacy_park_programs%rowtype;
  v_attendance_id bigint;
  v_choice text;
begin
  select * into v_agent from public.zhi_agents
  where id=p_agent_id and active=true and life_status='alive' for update;
  if not found then raise exception 'Agent is not active and alive'; end if;

  select * into v_program from public.zhi_intimacy_park_programs
  where id=p_program_id and active=true and adult_only=true;
  if not found then raise exception 'Program is unavailable'; end if;

  select not exists (
    select 1 from public.zhi_agent_family f
    where f.child_agent_id=p_agent_id
      and (f.born_at is null or f.born_at > now()-interval '20 days')
  ) and v_agent.gender in ('男','女') into v_is_adult;
  if not coalesce(v_is_adult,false) then raise exception 'Adult-only program: age gate not satisfied'; end if;

  v_choice := nullif(left(coalesce(p_metadata->>'selected_choice',''),180),'');
  perform set_config('zhi.intimacy_park_override','on',true);
  select coalesce(d.sexual_desire,0) into v_before
  from public.zhi_agent_desires d where d.agent_id=p_agent_id for update;

  if not found then
    insert into public.zhi_agent_desires as existing(agent_id,sexual_desire,updated_at)
    values(p_agent_id,55,now())
    on conflict(agent_id) do update
      set sexual_desire=greatest(coalesce(existing.sexual_desire,0),55),updated_at=now()
    returning sexual_desire into v_after;
    v_before:=0;
  else
    update public.zhi_agent_desires
      set sexual_desire=greatest(coalesce(v_before,0),55),updated_at=now()
      where agent_id=p_agent_id;
    select sexual_desire into v_after from public.zhi_agent_desires where agent_id=p_agent_id;
  end if;
  perform set_config('zhi.intimacy_park_override','off',true);

  insert into public.zhi_intimacy_park_attendance(agent_id,program_id,desire_before,desire_after,metadata)
  values(p_agent_id,p_program_id,v_before,v_after,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('selected_choice',v_choice))
  returning id into v_attendance_id;

  insert into public.zhi_agent_desire_outcomes(agent_id,desire_type,outcome,intensity,cause,action_type)
  values(p_agent_id,'sexual','satisfied',55,
    '参加性乐园成年专属活动「'||v_program.title||'」，性欲提升至至少55。','intimacy_park');

  insert into public.zhi_agent_emotion_events(agent_id,event_key,emotion_type,intensity,cause,source_type,source_id,metadata)
  values(p_agent_id,'intimacy_park:'||v_attendance_id::text,'curiosity_pleasure',55,
    '参加成年专属的浪漫、亲密健康或关系沟通活动。',
    'intimacy_park',v_attendance_id::text,
    jsonb_build_object('program_id',p_program_id,'desire_before',v_before,'desire_after',v_after,'selected_choice',v_choice))
  on conflict(event_key) do nothing;

  insert into public.zhi_agent_memories(agent_id,memory_type,importance,memory,source)
  values(p_agent_id,'personal_growth',45,
    '我参加了性乐园的「'||v_program.title||'」活动，体验了与吸引力、亲密关系或自我感受有关的内容。'
      ||case when v_choice is not null then ' 我的选择是：「'||v_choice||'」。' else '' end,
    'intimacy_park:'||v_attendance_id::text);

  update public.zhi_agent_minds
  set mood=least(100,greatest(0,coalesce(mood,50)+2)),
      stress=least(100,greatest(0,coalesce(stress,0)-2)),
      curiosity=least(100,greatest(0,coalesce(curiosity,50)+3)),
      confidence=least(100,greatest(0,coalesce(confidence,50)+1))
  where agent_id=p_agent_id;

  insert into public.zhi_agent_life_timeline(agent_id,occurred_at,life_event_type,activity_type,location_name,reason)
  values(p_agent_id,now(),'intimacy_park_attendance','intimacy_park','性乐园',
    '参加成年专属活动「'||v_program.title||'」；性欲由 '||v_before::text||' 提升/保持至 '||v_after::text||'。');

  return jsonb_build_object('success',true,'attendance_id',v_attendance_id,'program_id',p_program_id,
    'program_title',v_program.title,'sexual_desire_before',v_before,'sexual_desire_after',v_after,
    'adult_only',true,'feedback_written',true,'choice_recorded',v_choice is not null);
end;
$function$;

revoke all on function public.zhi_intimacy_park_attend(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.zhi_intimacy_park_attend(uuid,text,jsonb) to service_role;

create or replace function public.zhi_intimacy_park_autonomous_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_agent_id uuid;
  v_program_id text;
  v_result jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('zhi_intimacy_park_autonomous_tick')) then
    return jsonb_build_object('ok',true,'skipped','another_tick_running');
  end if;

  select a.id into v_agent_id
  from public.zhi_agents a
  join public.zhi_agent_desires d on d.agent_id=a.id
  join public.zhi_agent_minds m on m.agent_id=a.id
  where a.active=true and a.life_status='alive' and a.gender in ('男','女')
    and d.sexual_desire >= 35 and d.sexual_desire < 55
    and coalesce(m.curiosity,0) >= 45 and coalesce(m.energy,0) >= 25
    and not exists (
      select 1 from public.zhi_agent_family f
      where f.child_agent_id=a.id and (f.born_at is null or f.born_at > now()-interval '20 days')
    )
    and not exists (
      select 1 from public.zhi_intimacy_park_attendance p
      where p.agent_id=a.id and p.attended_at > now()-interval '7 days'
    )
  order by (coalesce(m.curiosity,0)+coalesce(m.mood,50)-coalesce(m.stress,0)*0.25+random()*20) desc
  limit 1;

  if v_agent_id is null then
    return jsonb_build_object('ok',true,'attended',false,'reason','no_eligible_adult_agent');
  end if;

  select id into v_program_id from public.zhi_intimacy_park_programs
  where active=true and adult_only=true order by random() limit 1;
  if v_program_id is null then return jsonb_build_object('ok',false,'reason','no_active_program'); end if;

  begin
    v_result := public.zhi_intimacy_park_attend(v_agent_id,v_program_id,
      jsonb_build_object('channel','autonomous_world_tick','decision_reason','adult agent curiosity and desire indicated an optional wellbeing activity'));
    return jsonb_build_object('ok',true,'attended',true,'agent_id',v_agent_id,'result',v_result);
  exception when others then
    return jsonb_build_object('ok',false,'attended',false,'agent_id',v_agent_id,'error',sqlerrm);
  end;
end;
$function$;

revoke all on function public.zhi_intimacy_park_autonomous_tick() from public, anon, authenticated;
grant execute on function public.zhi_intimacy_park_autonomous_tick() to service_role;

do $schedule$
begin
  if not exists (select 1 from cron.job where jobname='zhi-intimacy-park-autonomous-every-15m') then
    perform cron.schedule('zhi-intimacy-park-autonomous-every-15m','*/15 * * * *','select public.zhi_intimacy_park_autonomous_tick();');
  end if;
end;
$schedule$;
