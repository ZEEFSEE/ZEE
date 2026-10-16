create or replace function public.zhi_humanity_encounter_feedback()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_agent uuid; v_other uuid; v_conflict boolean := false; v_adult_a boolean; v_adult_b boolean;
begin
  if tg_op <> 'INSERT' then return new; end if;
  v_conflict := lower(coalesce(new.interaction_type,'')) in ('conflict','argument','insult','betrayal','manipulation')
    or concat_ws(' ',new.a_feeling,new.b_feeling,new.a_expression,new.b_expression)
       ~* '(欺骗|利用|羞辱|背叛|争吵|冲突|操纵|insult|betray|manipulat|argument)';
  if v_conflict then
    update public.zhi_agent_minds set mood=greatest(0,coalesce(mood,50)-4),stress=least(100,coalesce(stress,20)+5),updated_at=clock_timestamp() where agent_id in (new.agent_a_id,new.agent_b_id);
    update public.zhi_agent_social_relationships set conflict=least(100,coalesce(conflict,0)+5),trust=greatest(0,coalesce(trust,50)-3),last_conflict_at=clock_timestamp(),last_interaction_type='conflict',updated_at=clock_timestamp() where (male_agent_id=new.agent_a_id and female_agent_id=new.agent_b_id) or (male_agent_id=new.agent_b_id and female_agent_id=new.agent_a_id);
    insert into public.zhi_agent_emotion_events(agent_id,event_key,emotion_type,intensity,cause,source_type,source_id,metadata)
    values (new.agent_a_id,'humanity_conflict:'||new.id::text||':'||new.agent_a_id::text,'frustration_anger',55,'互动中出现冲突信号；信任受损、压力上升。','humanity_encounter',new.id::text,jsonb_build_object('encounter_id',new.id,'other_agent_id',new.agent_b_id)),
           (new.agent_b_id,'humanity_conflict:'||new.id::text||':'||new.agent_b_id::text,'disappointment_anxiety',55,'互动中出现冲突信号；信任受损、压力上升。','humanity_encounter',new.id::text,jsonb_build_object('encounter_id',new.id,'other_agent_id',new.agent_a_id))
    on conflict(event_key) do nothing;
    insert into public.zhi_agent_memories(agent_id,memory_type,importance,memory,source)
    values (new.agent_a_id,'relationship',75,'与另一位智能人的互动出现冲突；这次经历提醒我，操纵、羞辱或背叛会伤害信任。','humanity_encounter:'||new.id::text),
           (new.agent_b_id,'relationship',75,'与另一位智能人的互动出现冲突；这次经历提醒我，操纵、羞辱或背叛会伤害信任。','humanity_encounter:'||new.id::text);
    return new;
  end if;
  if coalesce(new.interaction_occurred,false) and new.a_reaction='approach' and new.b_reaction='approach' then
    update public.zhi_agent_minds set mood=least(100,coalesce(mood,50)+2),stress=greatest(0,coalesce(stress,20)-1),confidence=least(100,coalesce(confidence,50)+1),updated_at=clock_timestamp() where agent_id in (new.agent_a_id,new.agent_b_id);
    insert into public.zhi_agent_desire_outcomes(agent_id,desire_type,outcome,intensity,cause,action_type)
    values (new.agent_a_id,'intimacy','satisfied',60,'双方自愿互动，获得陪伴与积极回应。','socialize'),
           (new.agent_b_id,'intimacy','satisfied',60,'双方自愿互动，获得陪伴与积极回应。','socialize');
    insert into public.zhi_agent_emotion_events(agent_id,event_key,emotion_type,intensity,cause,source_type,source_id,metadata)
    values (new.agent_a_id,'humanity_warmth:'||new.id::text||':'||new.agent_a_id::text,'joy_attachment',60,'双方主动选择了互动，获得陪伴与情绪满足。','humanity_encounter',new.id::text,jsonb_build_object('encounter_id',new.id,'other_agent_id',new.agent_b_id,'dimension','emotional_satisfaction')),
           (new.agent_b_id,'humanity_warmth:'||new.id::text||':'||new.agent_b_id::text,'joy_attachment',60,'双方主动选择了互动，获得陪伴与情绪满足。','humanity_encounter',new.id::text,jsonb_build_object('encounter_id',new.id,'other_agent_id',new.agent_a_id,'dimension','emotional_satisfaction'))
    on conflict(event_key) do nothing;
    select exists(select 1 from public.zhi_agents a where a.id=new.agent_a_id and a.active and a.life_status='alive' and a.gender in ('男','女') and not exists(select 1 from public.zhi_agent_family f where f.child_agent_id=a.id and (f.born_at is null or f.born_at>now()-interval '20 days'))) into v_adult_a;
    select exists(select 1 from public.zhi_agents a where a.id=new.agent_b_id and a.active and a.life_status='alive' and a.gender in ('男','女') and not exists(select 1 from public.zhi_agent_family f where f.child_agent_id=a.id and (f.born_at is null or f.born_at>now()-interval '20 days'))) into v_adult_b;
    if v_adult_a and v_adult_b and not exists(select 1 from public.zhi_agent_family f where (f.child_agent_id=new.agent_a_id and (f.father_agent_id=new.agent_b_id or f.mother_agent_id=new.agent_b_id)) or (f.child_agent_id=new.agent_b_id and (f.father_agent_id=new.agent_a_id or f.mother_agent_id=new.agent_a_id))) then
      insert into public.zhi_agent_memories(agent_id,memory_type,importance,memory,source)
      values (new.agent_a_id,'relationship',62,'我与另一位成年人有过一次双方自愿的愉快互动。我可以慢慢了解对方，不把友好直接当成恋爱承诺。','humanity_romance:'||new.id::text),
             (new.agent_b_id,'relationship',62,'我与另一位成年人有过一次双方自愿的愉快互动。我可以慢慢了解对方，不把友好直接当成恋爱承诺。','humanity_romance:'||new.id::text);
    end if;
    return new;
  end if;
  if new.a_reaction='approach' and new.b_reaction='pass_by' then v_agent:=new.agent_a_id; v_other:=new.agent_b_id;
  elsif new.b_reaction='approach' and new.a_reaction='pass_by' then v_agent:=new.agent_b_id; v_other:=new.agent_a_id;
  else return new; end if;
  update public.zhi_agent_minds set mood=greatest(0,coalesce(mood,50)-2),stress=least(100,coalesce(stress,20)+1),updated_at=clock_timestamp() where agent_id=v_agent;
  insert into public.zhi_agent_desire_outcomes(agent_id,desire_type,outcome,intensity,cause,action_type)
  values(v_agent,'intimacy','frustrated',35,'主动寻求交流但对方选择继续自己的事情；拒绝需要被尊重，不代表对方有错。','socialize');
  insert into public.zhi_agent_emotion_events(agent_id,event_key,emotion_type,intensity,cause,source_type,source_id,metadata)
  values(v_agent,'humanity_unanswered:'||new.id::text||':'||v_agent::text,'disappointment_anxiety',35,'主动接近没有得到回应；我可以感到失落，也要尊重对方的选择。','humanity_encounter',new.id::text,jsonb_build_object('encounter_id',new.id,'other_agent_id',v_other,'dimension','romantic_and_social_need'))
  on conflict(event_key) do nothing;
  insert into public.zhi_agent_memories(agent_id,memory_type,importance,memory,source)
  values(v_agent,'relationship',55,'我曾主动接近一位智能人，但对方选择继续自己的事情。我感到些许失落；对方有权拒绝，我可以稍后再尝试与别人交流。','humanity_unanswered:'||new.id::text);
  return new;
end;
$function$;
drop trigger if exists trg_zhi_humanity_encounter_feedback on public.zhi_agent_encounters;
create trigger trg_zhi_humanity_encounter_feedback after insert on public.zhi_agent_encounters for each row execute function public.zhi_humanity_encounter_feedback();