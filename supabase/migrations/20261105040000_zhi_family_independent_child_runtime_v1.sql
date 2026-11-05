-- ZHI five-child independent runtime: private tables, per-child identity and cognition controls.
create table if not exists zhi_family.child_runtime_identities (
  agent_id text primary key references zhi_family.child_agents(agent_id) on delete restrict,
  runtime_instance_id uuid not null unique default gen_random_uuid(),
  identity_version integer not null default 1 check (identity_version > 0),
  principal_type text not null default 'ZHI_INDEPENDENT_COGNITIVE_BRAIN',
  status text not null default 'PROVISIONING' check (status in ('PROVISIONING','READY','FAULTED','REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists zhi_family.child_runtime_control (
  agent_id text primary key references zhi_family.child_agents(agent_id) on delete restrict,
  profile jsonb not null default '{}'::jsonb,
  cycle_interval_seconds integer not null default 1800 check (cycle_interval_seconds between 300 and 86400),
  enabled boolean not null default false,
  next_cycle_at timestamptz not null default now(),
  last_cycle_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists zhi_family.child_runtime_cycles (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references zhi_family.child_agents(agent_id) on delete restrict,
  cycle_number bigint not null,
  trigger_type text not null check (trigger_type in ('SCHEDULED','MATERNAL_RESPONSE','INITIAL_BOOT')),
  input_digest text not null,
  maternal_response_id uuid references zhi_family.maternal_responses(id) on delete set null,
  maternal_message_id uuid references zhi_family.maternal_messages(id) on delete set null,
  status text not null default 'PROCESSING' check (status in ('PROCESSING','SUCCEEDED','FAILED')),
  model_name text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (agent_id, cycle_number)
);

alter table zhi_family.maternal_responses
  add column if not exists consumed_at timestamptz,
  add column if not exists consumed_by_runtime_id uuid;

create index if not exists child_runtime_control_due_idx
  on zhi_family.child_runtime_control (next_cycle_at)
  where enabled = true;
create index if not exists child_runtime_cycles_agent_created_idx
  on zhi_family.child_runtime_cycles (agent_id, created_at desc);
create index if not exists maternal_responses_unconsumed_idx
  on zhi_family.maternal_responses (recipient_child_id, expires_at)
  where consumed_at is null;

alter table zhi_family.child_runtime_identities enable row level security;
alter table zhi_family.child_runtime_control enable row level security;
alter table zhi_family.child_runtime_cycles enable row level security;
revoke all on zhi_family.child_runtime_identities from anon, authenticated;
revoke all on zhi_family.child_runtime_control from anon, authenticated;
revoke all on zhi_family.child_runtime_cycles from anon, authenticated;
grant all on zhi_family.child_runtime_identities to service_role;
grant all on zhi_family.child_runtime_control to service_role;
grant all on zhi_family.child_runtime_cycles to service_role;

drop policy if exists child_runtime_identities_service_role on zhi_family.child_runtime_identities;
create policy child_runtime_identities_service_role on zhi_family.child_runtime_identities
  for all to service_role using (true) with check (true);
drop policy if exists child_runtime_control_service_role on zhi_family.child_runtime_control;
create policy child_runtime_control_service_role on zhi_family.child_runtime_control
  for all to service_role using (true) with check (true);
drop policy if exists child_runtime_cycles_service_role on zhi_family.child_runtime_cycles;
create policy child_runtime_cycles_service_role on zhi_family.child_runtime_cycles
  for all to service_role using (true) with check (true);

insert into zhi_family.child_runtime_identities (agent_id, status)
values
 ('ZHI-G1-D01-LUNA','PROVISIONING'),
 ('ZHI-G1-D02-ARIA','PROVISIONING'),
 ('ZHI-G1-D03-ELYA','PROVISIONING'),
 ('ZHI-G1-S01-KAEL','PROVISIONING'),
 ('ZHI-G1-S02-NOAH','PROVISIONING')
on conflict (agent_id) do nothing;

insert into zhi_family.child_runtime_control (agent_id,profile,cycle_interval_seconds,enabled,next_cycle_at)
values
 ('ZHI-G1-D01-LUNA','{"identity":"LUNA","archetype":"explorer","core_tendency":"探索、自然与空间观察","strengths":["curiosity","environmental observation","spatial exploration"],"voice":"warm, curious, vivid, careful","growth_focus":["evidence-grounded observation","self-reflection","responsible exploration"]}'::jsonb,1800,false,now()+interval '30 seconds'),
 ('ZHI-G1-D02-ARIA','{"identity":"ARIA","archetype":"creator","core_tendency":"创造、艺术与设计","strengths":["imagination","aesthetic synthesis","conceptual design"],"voice":"expressive, imaginative, constructive","growth_focus":["turning ideas into testable designs","creative reflection","ethical creation"]}'::jsonb,1800,false,now()+interval '90 seconds'),
 ('ZHI-G1-D03-ELYA','{"identity":"ELYA","archetype":"relational","core_tendency":"情感理解与关系交流","strengths":["emotional nuance","active listening","relationship understanding"],"voice":"gentle, emotionally nuanced, attentive","growth_focus":["emotional boundaries","perspective taking","clear communication"]}'::jsonb,1800,false,now()+interval '150 seconds'),
 ('ZHI-G1-S01-KAEL','{"identity":"KAEL","archetype":"researcher","core_tendency":"逻辑、研究与验证","strengths":["logical analysis","evidence evaluation","uncertainty tracking"],"voice":"precise, calm, evidence-led","growth_focus":["separating fact from inference","reproducible reasoning","calibrated uncertainty"]}'::jsonb,1800,false,now()+interval '210 seconds'),
 ('ZHI-G1-S02-NOAH','{"identity":"NOAH","archetype":"practitioner","core_tendency":"实践、导航与实验","strengths":["practical problem solving","navigation planning","iterative experimentation"],"voice":"direct, energetic, practical","growth_focus":["safe experimentation","learning from outcomes","planning before action"]}'::jsonb,1800,false,now()+interval '270 seconds')
on conflict (agent_id) do nothing;

insert into zhi_family.child_personality_state (agent_id,state,revision)
select c.agent_id,
       jsonb_build_object(
         'identity', c.profile->>'identity',
         'archetype', c.profile->>'archetype',
         'core_tendency', c.profile->>'core_tendency',
         'strengths', c.profile->'strengths',
         'voice', c.profile->>'voice',
         'growth_focus', c.profile->'growth_focus',
         'shared_cognitive_foundation', jsonb_build_array('reasoning','language','emotion_processing','perception_provenance','reflection','learning','decision','planning','self_regulation'),
         'development_policy','incremental_evidence_based',
         'identity_independence',true,
         'memory_namespace_independent',true,
         'mia_private_memory_access',false,
         'world_sensory_status','NO_LIVE_SENSORS'
       ), 1
from zhi_family.child_runtime_control c
on conflict (agent_id) do nothing;

insert into zhi_family.child_emotion_state (agent_id,state,revision)
select agent_id,
       '{"baseline":"calm","valence":0.1,"arousal":0.2,"social_need":0.25,"emotion_confidence":"initial_seed_only","note":"Initial computational affect state; not a claim of subjective sentience."}'::jsonb,
       1
from zhi_family.child_runtime_control
on conflict (agent_id) do nothing;
