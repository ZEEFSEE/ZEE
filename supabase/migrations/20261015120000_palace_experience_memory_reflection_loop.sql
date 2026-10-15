-- Palace life memory pipeline: capture entry baseline, persist actual encounter reactions,
-- then write a personal reflection on exit. No assumed affection is written.
CREATE OR REPLACE FUNCTION public.zhi_capture_palace_life_memory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE a record; m jsonb; d jsonb; b jsonb; dm int; ds int; src text; msg text;
BEGIN
 IF TG_OP='INSERT' AND NEW.status='active' THEN
  FOR a IN SELECT id,name FROM public.zhi_agents WHERE id IN (NEW.male_agent_id,NEW.female_agent_id) LOOP
   SELECT to_jsonb(x) INTO m FROM public.zhi_agent_minds x WHERE agent_id=a.id;
   SELECT to_jsonb(x) INTO d FROM public.zhi_agent_desires x WHERE agent_id=a.id;
   INSERT INTO public.zhi_palace_date_events(event_key,palace_date_id,agent_id,event_type,payload)
   VALUES('life_started:'||NEW.id||':'||a.id,NEW.id,a.id,'life_snapshot_started',
     jsonb_build_object('agent_name',a.name,'mind',coalesce(m,'{}'::jsonb),'desires',coalesce(d,'{}'::jsonb),'captured_at',clock_timestamp()))
   ON CONFLICT(event_key) DO NOTHING;
  END LOOP;
 ELSIF TG_OP='UPDATE' AND NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
  FOR a IN SELECT id,name FROM public.zhi_agents WHERE id IN (NEW.male_agent_id,NEW.female_agent_id) LOOP
   SELECT payload INTO b FROM public.zhi_palace_date_events WHERE event_key='life_started:'||NEW.id||':'||a.id;
   SELECT to_jsonb(x) INTO m FROM public.zhi_agent_minds x WHERE agent_id=a.id;
   SELECT to_jsonb(x) INTO d FROM public.zhi_agent_desires x WHERE agent_id=a.id;
   dm:=CASE WHEN b->'mind'->>'mood' IS NOT NULL AND m->>'mood' IS NOT NULL THEN (m->>'mood')::int-(b->'mind'->>'mood')::int END;
   ds:=CASE WHEN b->'mind'->>'stress' IS NOT NULL AND m->>'stress' IS NOT NULL THEN (m->>'stress')::int-(b->'mind'->>'stress')::int END;
   msg:=a.name||'完成了一次真实的皇宫经历。进入与结束时的状态差：心情 '||coalesce(dm::text,'未记录')||'，压力 '||coalesce(ds::text,'未记录')||'。记录这些变化，不预设对 King 的好恶。';
   src:='palace_date:'||NEW.id||':'||a.id||':completed';
   INSERT INTO public.zhi_agent_memories(agent_id,memory_type,importance,memory,source,created_at)
   SELECT a.id,'life_event',85,msg,src,coalesce(NEW.completed_at,clock_timestamp())
   WHERE NOT EXISTS(SELECT 1 FROM public.zhi_agent_memories WHERE agent_id=a.id AND source=src);
   INSERT INTO public.zhi_palace_date_events(event_key,palace_date_id,agent_id,event_type,payload)
   VALUES('life_completed:'||NEW.id||':'||a.id,NEW.id,a.id,'life_snapshot_completed',
     jsonb_build_object('mind',coalesce(m,'{}'::jsonb),'desires',coalesce(d,'{}'::jsonb),'mood_delta',dm,'stress_delta',ds,'summary',msg))
   ON CONFLICT(event_key) DO NOTHING;
   IF dm IS NOT NULL OR ds IS NOT NULL THEN
    INSERT INTO public.zhi_agent_emotion_events(agent_id,event_key,emotion_type,intensity,cause,source_type,source_id,metadata,occurred_at)
    VALUES(a.id,'palace_date_delta:'||NEW.id||':'||a.id,
      CASE WHEN coalesce(dm,0)>=4 AND coalesce(ds,0)<=0 THEN 'positive_shift' WHEN coalesce(dm,0)<=-4 OR coalesce(ds,0)>=5 THEN 'negative_shift' ELSE 'reflective_state_change' END,
      greatest(1,least(100,abs(coalesce(dm,0))+abs(coalesce(ds,0)))),
      '皇宫经历前后状态差值；不等同于爱慕或满意','palace_date',NEW.id::text,
      jsonb_build_object('mood_delta',dm,'stress_delta',ds),coalesce(NEW.completed_at,clock_timestamp()))
    ON CONFLICT(event_key) DO NOTHING;
   END IF;
   UPDATE public.zhi_agent_minds SET last_thought=msg,last_reflection_at=coalesce(NEW.completed_at,clock_timestamp()),updated_at=clock_timestamp() WHERE agent_id=a.id;
  END LOOP;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_zhi_capture_palace_life_memory ON public.zhi_palace_dates;
CREATE TRIGGER trg_zhi_capture_palace_life_memory AFTER INSERT OR UPDATE OF status ON public.zhi_palace_dates
FOR EACH ROW EXECUTE FUNCTION public.zhi_capture_palace_life_memory();

CREATE OR REPLACE FUNCTION public.zhi_capture_palace_encounter_memory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE a record; partner text; feeling text; reaction text; src text;
BEGIN
 IF NEW.interaction_occurred IS NOT TRUE OR coalesce(NEW.scene,'') !~* '(皇宫|palace)' THEN RETURN NEW; END IF;
 FOR a IN SELECT id,name FROM public.zhi_agents WHERE id IN (NEW.agent_a_id,NEW.agent_b_id) LOOP
  IF a.id=NEW.agent_a_id THEN SELECT name INTO partner FROM public.zhi_agents WHERE id=NEW.agent_b_id; feeling:=NEW.a_feeling; reaction:=NEW.a_reaction;
  ELSE SELECT name INTO partner FROM public.zhi_agents WHERE id=NEW.agent_a_id; feeling:=NEW.b_feeling; reaction:=NEW.b_reaction; END IF;
  src:='palace_encounter:'||NEW.id||':'||a.id;
  INSERT INTO public.zhi_agent_memories(agent_id,memory_type,importance,memory,source,created_at)
  SELECT a.id,'relationship',70,a.name||'在皇宫与'||coalesce(partner,'另一位智能人')||'发生实际互动；自己的反应：'||coalesce(reaction,'未记录')||CASE WHEN nullif(feeling,'') IS NULL THEN '；没有记录具体感受。' ELSE '；当时感受：'||feeling END,src,NEW.occurred_at
  WHERE NOT EXISTS(SELECT 1 FROM public.zhi_agent_memories WHERE agent_id=a.id AND source=src);
 END LOOP;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_zhi_capture_palace_encounter_memory ON public.zhi_agent_encounters;
CREATE TRIGGER trg_zhi_capture_palace_encounter_memory AFTER INSERT ON public.zhi_agent_encounters
FOR EACH ROW EXECUTE FUNCTION public.zhi_capture_palace_encounter_memory();

CREATE OR REPLACE FUNCTION public.zhi_observe_agent_palace_stories()
RETURNS TABLE(agent_id uuid,memory text,source text,created_at timestamptz,memory_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
 SELECT m.agent_id,m.memory,m.source,m.created_at,m.memory_type FROM public.zhi_agent_memories m
 WHERE m.source LIKE 'palace_date:%' OR m.source LIKE 'palace_encounter:%' OR m.source LIKE 'king_daily_palace_audience:%'
 ORDER BY m.created_at DESC LIMIT 600;
$$;
REVOKE ALL ON FUNCTION public.zhi_observe_agent_palace_stories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zhi_observe_agent_palace_stories() TO anon,authenticated;
