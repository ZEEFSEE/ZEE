-- Allow the public palace observatory to read simulated agents' desire state.
-- RLS remains enabled; this policy grants SELECT only and does not permit writes.
GRANT SELECT ON TABLE public.zhi_agent_desires TO anon, authenticated;

DROP POLICY IF EXISTS zhi_agent_desires_public_read ON public.zhi_agent_desires;
CREATE POLICY zhi_agent_desires_public_read
ON public.zhi_agent_desires
FOR SELECT
TO anon, authenticated
USING (true);
