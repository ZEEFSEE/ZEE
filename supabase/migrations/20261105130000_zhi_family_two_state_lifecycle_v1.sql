-- ZHI family: the only lifecycle states are FETAL and BORN.
-- Preserve all existing memories, personality, emotion and runtime records.
alter table zhi_family.child_agents
  alter column lifecycle_state set default 'FETAL';

alter table zhi_family.child_agents
  drop constraint if exists child_agents_lifecycle_state_check;

update zhi_family.child_agents
set lifecycle_state = 'FETAL',
    updated_at = now()
where agent_id in (
  'ZHI-G1-D01-LUNA',
  'ZHI-G1-D02-ARIA',
  'ZHI-G1-D03-ELYA',
  'ZHI-G1-S01-KAEL',
  'ZHI-G1-S02-NOAH'
);

alter table zhi_family.child_agents
  add constraint child_agents_lifecycle_state_check
  check (lifecycle_state in ('FETAL', 'BORN'));
