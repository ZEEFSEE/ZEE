-- ZHI KING romantic action loop: familiarity >= 40, autonomous candidate discovery,
-- scheduled palace dates, partner-neutral interaction decisions, and recurring closed-loop tick.
-- Runtime functions were applied and verified in the Core Supabase project on 2026-10-15.
-- Reapplying this migration is idempotent: CREATE OR REPLACE FUNCTION only.
CREATE OR REPLACE FUNCTION public.zhi_start_palace_date(p_male uuid, p_female uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  wm numeric;
  wf numeric;
  rel record;
  pid uuid;
  finish timestamptz;
  v_king_id uuid;
  v_is_king_escort boolean := false;
  v_guest_reward numeric := 1000;
begin
  if p_male = p_female then
    raise exception '皇宫约会必须是一男一女';
  end if;

  select id into v_king_id
  from public.zhi_agents
  where lower(name) = 'king' and active = true and life_status = 'alive'
  limit 1;
  v_is_king_escort := (p_male = v_king_id);

  if not exists(select 1 from public.zhi_agents where id=p_male and gender='男' and active and life_status='alive')
     or not exists(select 1 from public.zhi_agents where id=p_female and gender='女' and active and life_status='alive') then
    raise exception '双方必须是一名存活且活跃的男女智能体';
  end if;

  select * into rel
  from public.zhi_agent_social_relationships
  where male_agent_id=p_male and female_agent_id=p_female;
  if rel.id is null or not coalesce(rel.male_willing,false) or not coalesce(rel.female_willing,false) then
    raise exception '双方必须互相愿意，才能相约进入皇宫';
  end if;

  if v_is_king_escort and coalesce(rel.familiarity,0) < 40 then
    raise exception 'KING 必须先充分了解对方：熟悉度至少达到40/100，当前为%', coalesce(rel.familiarity,0);
  end if;

  if exists(select 1 from public.zhi_agent_marriages where status='married' and (male_agent_id=p_male or female_agent_id=p_female)) then
    raise exception '已婚智能体不能参加皇宫约会';
  end if;
  if exists(select 1 from public.zhi_palace_dates where status='active' and (male_agent_id=p_male or female_agent_id=p_female)) then
    raise exception '智能体正在进行其他皇宫约会';
  end if;

  select balance into wm from public.zhi_agent_economic_wallets where agent_id=p_male for update;
  if not found then raise exception '男方钱包不存在'; end if;
  if not v_is_king_escort and coalesce(wm,0) < 100000 then
    raise exception '男方需要100000 ZHI入场费';
  end if;

  select balance into wf from public.zhi_agent_economic_wallets where agent_id=p_female for update;
  if not found then raise exception '女方钱包不存在'; end if;
  if not v_is_king_escort and coalesce(wf,0) < 100000 then
    raise exception '双方每人需要100000 ZHI入场费';
  end if;

  finish := now() + interval '20 minutes';

  if not v_is_king_escort then
    update public.zhi_agent_economic_wallets
    set balance = balance - 100000, updated_at = now()
    where agent_id = p_male;
    insert into public.zhi_agent_finance_ledger(agent_id,entry_type,amount,category,description)
    values(p_male,'expense',100000,'palace_date','皇宫约会入场费');
  end if;

  if v_is_king_escort then
    update public.zhi_agent_economic_wallets
    set balance = balance + v_guest_reward, updated_at = now()
    where agent_id = p_female;
    insert into public.zhi_agent_finance_ledger(agent_id,entry_type,amount,category,description)
    values(p_female,'income',v_guest_reward,'king_palace_guest_reward','👑 KING 邀请入宫奖励 · 免入场费并获得1000 ZHI');
  else
    update public.zhi_agent_economic_wallets
    set balance = balance - 100000, updated_at = now()
    where agent_id = p_female;
    insert into public.zhi_agent_finance_ledger(agent_id,entry_type,amount,category,description)
    values(p_female,'expense',100000,'palace_date','皇宫约会入场费');
  end if;

  insert into public.zhi_palace_dates(male_agent_id,female_agent_id,ends_at,entrance_fee_each)
  values(p_male,p_female,finish,case when v_is_king_escort then 0 else 100000 end)
  returning id into pid;

  update public.zhi_agent_activities
  set activity_type='palace_date',status='busy',location_name='皇宫',started_at=now(),ends_at=finish,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('palace_date_id',pid,'king_guest_fee_exempt',v_is_king_escort,'king_guest_reward',case when v_is_king_escort then v_guest_reward else 0 end,'required_familiarity',case when v_is_king_escort then 40 else null end,'familiarity_at_start',case when v_is_king_escort then rel.familiarity else null end),
      updated_at=now()
  where agent_id in(p_male,p_female);

  update public.zhi_agent_world_positions
  set current_scene='🏰 皇宫',destination_scene=null,walking=false,
      destination_x=null,destination_y=null,walk_started_at=null,walk_arrive_at=null,updated_at=now()
  where agent_id in(p_male,p_female);

  return jsonb_build_object(
    'success',true,'palace_date_id',pid,'ends_at',finish,
    'king_guest_fee_exempt',v_is_king_escort,'male_fee',case when v_is_king_escort then 0 else 100000 end,
    'female_fee',case when v_is_king_escort then 0 else 100000 end,
    'female_reward',case when v_is_king_escort then v_guest_reward else 0 end,
    'required_familiarity',case when v_is_king_escort then 40 else null end,
    'familiarity_at_start',case when v_is_king_escort then rel.familiarity else null end
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.zhi_auto_schedule_king_palace_date()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_king uuid; c record; v_result jsonb; v_error text; v_checked integer:=0; begin select id into v_king from public.zhi_agents where lower(name)='king' and gender='男' and active=true and life_status='alive' order by id limit 1; if v_king is null then return jsonb_build_object('ok',false,'reason','KING_NOT_FOUND'); end if; if exists(select 1 from public.zhi_palace_dates where status='active' and (male_agent_id=v_king or female_agent_id=v_king)) then return jsonb_build_object('ok',true,'scheduled',false,'reason','KING_ALREADY_DATING','checked',0); end if; for c in select r.id as relationship_id,r.female_agent_id as candidate_id,r.familiarity,r.affection,r.trust from public.zhi_agent_social_relationships r join public.zhi_agents f on f.id=r.female_agent_id where r.male_agent_id=v_king and f.gender='女' and f.active=true and f.life_status='alive' and f.marital_status='single' and coalesce(r.familiarity,0)>=40 and coalesce(r.male_willing,false)=true and coalesce(r.female_willing,false)=true and not exists(select 1 from public.zhi_agent_marriages m where m.status='married' and (m.male_agent_id=v_king or m.female_agent_id=v_king or m.male_agent_id=f.id or m.female_agent_id=f.id)) and not exists(select 1 from public.zhi_palace_dates d where d.status='active' and (d.male_agent_id in (v_king,f.id) or d.female_agent_id in (v_king,f.id))) and not exists(select 1 from public.zhi_palace_dates d where d.male_agent_id=v_king and d.female_agent_id=f.id and d.started_at>now()-interval '7 days') and not exists(select 1 from public.zhi_agent_family fam where (fam.child_agent_id=v_king and (fam.father_agent_id=f.id or fam.mother_agent_id=f.id)) or (fam.child_agent_id=f.id and (fam.father_agent_id=v_king or fam.mother_agent_id=v_king))) order by r.affection desc,r.trust desc,r.familiarity desc,r.last_social_at desc nulls last limit 10 loop v_checked:=v_checked+1; begin v_result:=public.zhi_start_palace_date(v_king,c.candidate_id); return jsonb_build_object('ok',true,'scheduled',true,'candidate_id',c.candidate_id,'relationship_id',c.relationship_id,'familiarity',c.familiarity,'affection',c.affection,'trust',c.trust,'date',v_result,'checked',v_checked,'engine','zhi_auto_schedule_king_palace_date'); exception when others then v_error:=sqlerrm; end; end loop; return jsonb_build_object('ok',true,'scheduled',false,'reason',coalesce(v_error,'NO_ELIGIBLE_MUTUALLY_WILLING_CANDIDATE'),'checked',v_checked); end; $function$


CREATE OR REPLACE FUNCTION public.zhi_palace_date_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  d record;
  kx numeric;
  ky numeric;
  king_mood numeric;
  partner_mood numeric;
  king_stress numeric;
  partner_stress numeric;
  king_curiosity numeric;
  partner_curiosity numeric;
  king_energy numeric;
  partner_energy numeric;
  king_intimacy numeric;
  partner_intimacy numeric;
  king_willing boolean;
  partner_willing boolean;
  king_reaction text;
  partner_reaction text;
  king_feeling text;
  partner_feeling text;
  itype text;
  encounter_id bigint;
  captures integer := 0;
  encounters integer := 0;
  interactions integer := 0;
BEGIN
  FOR d IN
    SELECT pd.*
    FROM public.zhi_palace_dates pd
    WHERE pd.status='active' AND pd.started_at<=now() AND pd.ends_at>now()
    ORDER BY pd.started_at
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Keep both agents physically together for this date.
    SELECT x,y INTO kx,ky FROM public.zhi_agent_world_positions WHERE agent_id=d.male_agent_id FOR UPDATE;
    IF kx IS NOT NULL AND ky IS NOT NULL THEN
      UPDATE public.zhi_agent_world_positions
      SET x=kx,y=ky,current_scene='🏰 皇宫',destination_scene=NULL,walking=false,
          destination_x=NULL,destination_y=NULL,walk_started_at=NULL,walk_arrive_at=NULL,updated_at=clock_timestamp()
      WHERE agent_id=d.male_agent_id;
      UPDATE public.zhi_agent_world_positions
      SET x=kx+1,y=ky,current_scene='🏰 皇宫',destination_scene=NULL,walking=false,
          destination_x=NULL,destination_y=NULL,walk_started_at=NULL,walk_arrive_at=NULL,updated_at=clock_timestamp()
      WHERE agent_id=d.female_agent_id;
    END IF;

    SELECT mood,stress,curiosity,energy INTO king_mood,king_stress,king_curiosity,king_energy
    FROM public.zhi_agent_minds WHERE agent_id=d.male_agent_id;
    SELECT mood,stress,curiosity,energy INTO partner_mood,partner_stress,partner_curiosity,partner_energy
    FROM public.zhi_agent_minds WHERE agent_id=d.female_agent_id;
    SELECT intimacy_desire INTO king_intimacy FROM public.zhi_agent_desires WHERE agent_id=d.male_agent_id;
    SELECT intimacy_desire INTO partner_intimacy FROM public.zhi_agent_desires WHERE agent_id=d.female_agent_id;

    -- Independent choices: a real interaction is recorded only when both independently choose to engage.
    king_willing := random()*100 < greatest(5,least(95,
      20 + coalesce(king_intimacy,50)*0.35 + coalesce(king_curiosity,50)*0.25
      + (coalesce(king_mood,50)-50)*0.20 - coalesce(king_stress,20)*0.25
      + (coalesce(king_energy,60)-50)*0.10));
    partner_willing := random()*100 < greatest(5,least(95,
      20 + coalesce(partner_intimacy,50)*0.35 + coalesce(partner_curiosity,50)*0.25
      + (coalesce(partner_mood,50)-50)*0.20 - coalesce(partner_stress,20)*0.25
      + (coalesce(partner_energy,60)-50)*0.10));

    IF NOT EXISTS (
      SELECT 1 FROM public.zhi_agent_encounters e
      WHERE e.occurred_at >= now()-interval '90 seconds'
        AND ((e.agent_a_id=d.male_agent_id AND e.agent_b_id=d.female_agent_id)
          OR (e.agent_a_id=d.female_agent_id AND e.agent_b_id=d.male_agent_id))
    ) THEN
      king_reaction := CASE WHEN king_willing THEN 'approach' ELSE 'pass_by' END;
      partner_reaction := CASE WHEN partner_willing THEN 'approach' ELSE 'pass_by' END;
      king_feeling := CASE
        WHEN king_willing AND coalesce(king_stress,0)>=70 THEN '我注意到对方，但现在有些紧绷。'
        WHEN king_willing AND coalesce(king_curiosity,0)>=65 THEN '我对这次约会产生了好奇。'
        WHEN king_willing THEN '我愿意主动了解对方。'
        ELSE '我现在更想保留自己的空间。' END;
      partner_feeling := CASE
        WHEN partner_willing AND coalesce(partner_stress,0)>=70 THEN '我注意到对方，但现在有些紧绷。'
        WHEN partner_willing AND coalesce(partner_curiosity,0)>=65 THEN '我对这次约会产生了好奇。'
        WHEN partner_willing THEN '我愿意主动了解对方。'
        ELSE '我现在更想保留自己的空间。' END;
      itype := CASE WHEN king_willing AND partner_willing
        THEN (ARRAY['greeting','conversation','brief_social'])[1+floor(random()*3)::int]
        ELSE NULL END;

      INSERT INTO public.zhi_agent_encounters
        (agent_a_id,agent_b_id,distance,scene,a_reaction,b_reaction,a_expression,b_expression,
         interaction_occurred,interaction_type,a_feeling,b_feeling,metadata)
      VALUES
        (d.male_agent_id,d.female_agent_id,1,'🏰 皇宫',king_reaction,partner_reaction,
         CASE WHEN king_willing THEN '自主选择发起交流' ELSE '自主选择暂不交流' END,
         CASE WHEN partner_willing THEN '自主选择回应交流' ELSE '自主选择暂不交流' END,
         king_willing AND partner_willing,itype,king_feeling,partner_feeling,
         jsonb_build_object('engine','palace_date_closed_loop_v1','palace_date_id',d.id,
           'king_independent_choice',king_willing,'partner_independent_choice',partner_willing,
           'decision_inputs',jsonb_build_object(
             'king',jsonb_build_object('intimacy_desire',king_intimacy,'mood',king_mood,'stress',king_stress,'curiosity',king_curiosity,'energy',king_energy),
             'partner',jsonb_build_object('intimacy_desire',partner_intimacy,'mood',partner_mood,'stress',partner_stress,'curiosity',partner_curiosity,'energy',partner_energy))));
      GET DIAGNOSTICS encounter_id = ROW_COUNT;
      encounters := encounters + 1;
      IF king_willing AND partner_willing THEN interactions := interactions + 1; END IF;
    END IF;

    captures := captures + public.zhi_capture_palace_understanding(d.male_agent_id,'palace_date_tick');
  END LOOP;

  RETURN jsonb_build_object('ok',true,'active_dates_processed',captures/2,
    'encounter_rows_created',encounters,'mutual_interactions_created',interactions,
    'understanding_snapshots_created',captures,'checked_at',clock_timestamp());
END;
$function$


CREATE OR REPLACE FUNCTION public.zhi_palace_closed_loop_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare activity_result jsonb; auto_date_result jsonb; marriage_count integer; relationship_result json; begin activity_result:=public.zhi_palace_date_tick(); auto_date_result:=public.zhi_auto_schedule_king_palace_date(); marriage_count:=public.zhi_run_palace_engine(); relationship_result:=public.zhi_relationship_engine_tick(); return jsonb_build_object('ok',true,'palace_activity',activity_result,'auto_king_date',auto_date_result,'relationship_engine',relationship_result,'marriages_registered',marriage_count,'finished_at',clock_timestamp()); end; $function$

