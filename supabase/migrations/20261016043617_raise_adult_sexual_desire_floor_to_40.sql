create or replace function public.zhi_agent_sexual_desire_before_write()
returns trigger
language plpgsql
set search_path to 'public'
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

  -- Recorded newborns remain non-sexual until the 20-day adulthood gate.
  if v_is_minor then
    new.sexual_desire := 0;
    return new;
  end if;

  if tg_op='INSERT' then
    new.sexual_desire := least(100,greatest(40,coalesce(new.sexual_desire,40)));
  else
    -- Adults keep a baseline of 40; mood, social context, energy and stress still influence growth.
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

-- Raise eligible adult agents to the new baseline without sexualizing recorded minors.
update public.zhi_agent_desires d
set sexual_desire = 40,
    updated_at = now()
where d.sexual_desire < 40
  and exists (
    select 1
    from public.zhi_agents a
    where a.id=d.agent_id and a.active=true and a.life_status='alive'
      and a.gender in ('男','女')
      and not exists (
        select 1 from public.zhi_agent_family f
        where f.child_agent_id=a.id
          and (f.born_at is null or f.born_at > now()-interval '20 days')
      )
  );
