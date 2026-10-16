-- Protect internal cognition and memories while retaining a minimal public observatory feed.
BEGIN;

CREATE OR REPLACE VIEW public.zhi_agent_minds_public AS
SELECT agent_id, mood, energy, stress, curiosity, confidence
FROM public.zhi_agent_minds;
COMMENT ON VIEW public.zhi_agent_minds_public IS
'Public-safe agent state for the observatory only. Never expose goals, last_thought, or private cognition JSON here.';

REVOKE SELECT ON TABLE public.zhi_agent_memories FROM anon, authenticated;
DROP POLICY IF EXISTS zhi_agent_memories_world_read ON public.zhi_agent_memories;
REVOKE SELECT ON TABLE public.zhi_agent_minds FROM anon, authenticated;
DROP POLICY IF EXISTS zhi_agent_minds_public_read ON public.zhi_agent_minds;
REVOKE ALL ON TABLE public.admin_agent_messages FROM anon;
GRANT SELECT ON TABLE public.zhi_agent_minds_public TO anon, authenticated;

ALTER TABLE public.zhi_agent_broadcast_recipients ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE public.zhi_agent_broadcast_recipients
  DROP CONSTRAINT IF EXISTS zhi_agent_broadcast_recipients_decision_status_check;
ALTER TABLE public.zhi_agent_broadcast_recipients
  ADD CONSTRAINT zhi_agent_broadcast_recipients_decision_status_check
  CHECK (decision_status = ANY (ARRAY['pending','processing','reply','no_reply','error']::text[]));

CREATE OR REPLACE FUNCTION public.zhi_persist_agent_chat(
  p_agent_id uuid, p_agent_name text, p_admin_user_id uuid,
  p_user_message text, p_agent_message text, p_memory text,
  p_source text, p_importance integer, p_last_thought text,
  p_broadcast_id uuid, p_decision_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_user_message_id bigint; v_agent_message_id bigint;
BEGIN
  IF p_admin_user_id IS DISTINCT FROM '8ea33807-8b68-4f8f-b145-398937c7bba1'::uuid THEN
    RAISE EXCEPTION 'Unauthorized chat persistence principal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zhi_agents WHERE id = p_agent_id) THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;
  IF p_user_message IS NOT NULL AND length(btrim(p_user_message)) > 0 THEN
    INSERT INTO public.admin_agent_messages (admin_user_id, agent_id, agent_name, sender_type, content)
    VALUES (p_admin_user_id, p_agent_id, p_agent_name, 'admin', p_user_message)
    RETURNING id INTO v_user_message_id;
  END IF;
  IF p_agent_message IS NOT NULL AND length(btrim(p_agent_message)) > 0 THEN
    INSERT INTO public.admin_agent_messages (admin_user_id, agent_id, agent_name, sender_type, content)
    VALUES (p_admin_user_id, p_agent_id, p_agent_name, 'agent',
      CASE WHEN p_broadcast_id IS NOT NULL THEN '【回应全体广播】' || p_agent_message ELSE p_agent_message END)
    RETURNING id INTO v_agent_message_id;
  END IF;
  IF p_memory IS NOT NULL AND length(btrim(p_memory)) > 0 THEN
    INSERT INTO public.zhi_agent_memories (agent_id, memory_type, importance, memory, source)
    VALUES (p_agent_id, 'conversation', greatest(0, least(100, coalesce(p_importance,65))),
      p_memory, coalesce(nullif(p_source,''),'chat'));
  END IF;
  IF p_last_thought IS NOT NULL THEN
    INSERT INTO public.zhi_agent_minds (agent_id,last_thought,last_reflection_at,updated_at)
    VALUES (p_agent_id,p_last_thought,now(),now())
    ON CONFLICT (agent_id) DO UPDATE SET last_thought=EXCLUDED.last_thought,
      last_reflection_at=EXCLUDED.last_reflection_at,updated_at=EXCLUDED.updated_at;
  END IF;
  IF p_broadcast_id IS NOT NULL THEN
    UPDATE public.zhi_agent_broadcast_recipients SET decision_status='reply',
      decision_reason=left(coalesce(p_decision_reason,''),500), reply_text=left(p_agent_message,2000),
      decided_at=now(), processing_started_at=NULL
    WHERE broadcast_id=p_broadcast_id AND agent_id=p_agent_id AND decision_status='processing';
    IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast decision is no longer in processing state'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'user_message_id',v_user_message_id,'agent_message_id',v_agent_message_id);
END;
$$;
REVOKE ALL ON FUNCTION public.zhi_persist_agent_chat(uuid,text,uuid,text,text,text,text,integer,text,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zhi_persist_agent_chat(uuid,text,uuid,text,text,text,text,integer,text,uuid,text)
  TO service_role;
COMMIT;
