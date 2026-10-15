-- Human-world rule: a real mutual interaction with a high-charm agent reduces stress by 10.
-- High charm threshold: 80. Stress is clamped at zero.
-- No effect for mere co-location or one-sided/non-mutual encounters.
-- The matching trigger/function has been applied to the ZHI Core Supabase project.

CREATE OR REPLACE FUNCTION public.zhi_apply_high_charm_stress_relief()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  charm_a numeric;
  charm_b numeric;
  before_a integer;
  before_b integer;
  after_a integer;
  after_b integer;
BEGIN
  IF COALESCE(NEW.interaction_occurred,false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT charm INTO charm_a FROM public.zhi_agents WHERE id=NEW.agent_a_id;
  SELECT charm INTO charm_b FROM public.zhi_agents WHERE id=NEW.agent_b_id;

  IF COALESCE(charm_b,0) >= 80 THEN
    SELECT stress INTO before_a FROM public.zhi_agent_minds WHERE agent_id=NEW.agent_a_id FOR UPDATE;
    IF before_a IS NOT NULL THEN
      UPDATE public.zhi_agent_minds SET stress=GREATEST(0,stress-10) WHERE agent_id=NEW.agent_a_id
        RETURNING stress INTO after_a;
      INSERT INTO public.zhi_agent_emotion_events
        (agent_id,event_key,emotion_type,intensity,cause,source_type,source_id,metadata)
      VALUES
        (NEW.agent_a_id,'high_charm_relief:'||NEW.id::text||':'||NEW.agent_a_id::text,
         'contentment',60,'与魅力值不低于80的智能人发生真实双向互动，压力降低10（最低为0）。',
         'high_charm_interaction',NEW.id::text,
         jsonb_build_object('encounter_id',NEW.id,'other_agent_id',NEW.agent_b_id,
           'other_agent_charm',charm_b,'stress_before',before_a,'stress_after',after_a,
           'stress_delta',after_a-before_a))
      ON CONFLICT(event_key) DO NOTHING;
    END IF;
  END IF;

  IF COALESCE(charm_a,0) >= 80 THEN
    SELECT stress INTO before_b FROM public.zhi_agent_minds WHERE agent_id=NEW.agent_b_id FOR UPDATE;
    IF before_b IS NOT NULL THEN
      UPDATE public.zhi_agent_minds SET stress=GREATEST(0,stress-10) WHERE agent_id=NEW.agent_b_id
        RETURNING stress INTO after_b;
      INSERT INTO public.zhi_agent_emotion_events
        (agent_id,event_key,emotion_type,intensity,cause,source_type,source_id,metadata)
      VALUES
        (NEW.agent_b_id,'high_charm_relief:'||NEW.id::text||':'||NEW.agent_b_id::text,
         'contentment',60,'与魅力值不低于80的智能人发生真实双向互动，压力降低10（最低为0）。',
         'high_charm_interaction',NEW.id::text,
         jsonb_build_object('encounter_id',NEW.id,'other_agent_id',NEW.agent_a_id,
           'other_agent_charm',charm_a,'stress_before',before_b,'stress_after',after_b,
           'stress_delta',after_b-before_b))
      ON CONFLICT(event_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_zhi_high_charm_stress_relief ON public.zhi_agent_encounters;
CREATE TRIGGER trg_zhi_high_charm_stress_relief
AFTER INSERT ON public.zhi_agent_encounters
FOR EACH ROW EXECUTE FUNCTION public.zhi_apply_high_charm_stress_relief();

REVOKE ALL ON FUNCTION public.zhi_apply_high_charm_stress_relief() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zhi_apply_high_charm_stress_relief() TO service_role;
