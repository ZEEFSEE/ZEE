-- Allow the same pair to have multiple historical palace dates.
-- Keep a uniqueness guard for an active date with the same pair.
ALTER TABLE public.zhi_palace_dates
  DROP CONSTRAINT IF EXISTS zhi_palace_dates_male_agent_id_female_agent_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS zhi_palace_dates_active_pair_uidx
  ON public.zhi_palace_dates (male_agent_id, female_agent_id)
  WHERE status = 'active';
