create schema zhi_family;
revoke all on schema zhi_family from public, anon, authenticated;
grant usage on schema zhi_family to service_role;

create table zhi_family.child_agents (
  agent_id text primary key check (agent_id in (
    'ZHI-G1-D01-LUNA','ZHI-G1-D02-ARIA','ZHI-G1-D03-ELYA',
    'ZHI-G1-S01-KAEL','ZHI-G1-S02-NOAH'
  )),
  display_name text not null unique,
  heart_id text not null unique,
  memory_namespace text not null unique,
  lifecycle_state text not null default 'REGISTERED'
    check (lifecycle_state in ('REGISTERED','PROVISIONING','ACTIVE','SUSPENDED','RETIRED')),
  runtime_status text not null default 'NOT_CONNECTED'
    check (runtime_status in ('NOT_CONNECTED','READY','FAULTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table zhi_family.child_runtime_state (
  agent_id text primary key references zhi_family.child_agents(agent_id) on delete restrict,
  scene_id text null check (scene_id is null or scene_id in (
    'mia-forest-corner','crystal-forest','ocean-of-light','memory-valley','living-city','greenhouse'
  )),
  position jsonb null,
  coordinate_frame text null,
  runtime_instance_id text null,
  movement_revision bigint not null default 0 check (movement_revision >= 0),
  perception_frame jsonb null,
  perception_provenance text not null default 'NONE'
    check (perception_provenance in ('NONE','AUTHORED_SCENE_DATA','BROWSER_RUNTIME','EXTERNAL_SENSOR')),
  updated_at timestamptz not null default now()
);

create table zhi_family.child_personality_state (
  agent_id text primary key references zhi_family.child_agents(agent_id) on delete restrict,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table zhi_family.child_emotion_state (
  agent_id text primary key references zhi_family.child_agents(agent_id) on delete restrict,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table zhi_family.child_memory_entries (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references zhi_family.child_agents(agent_id) on delete restrict,
  memory_type text not null,
  content text not null,
  importance numeric(5,4) not null default 0.5 check (importance between 0 and 1),
  occurred_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index child_memory_entries_agent_created_idx
  on zhi_family.child_memory_entries(agent_id, created_at desc);

create table zhi_family.child_learning_events (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references zhi_family.child_agents(agent_id) on delete restrict,
  event_type text not null,
  evidence jsonb not null default '{}'::jsonb,
  outcome jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index child_learning_events_agent_created_idx
  on zhi_family.child_learning_events(agent_id, created_at desc);

create table zhi_family.destination_grants (
  agent_id text not null references zhi_family.child_agents(agent_id) on delete restrict,
  destination_id text not null check (destination_id in (
    'crystal-forest','ocean-of-light','memory-valley','living-city','greenhouse'
  )),
  grant_status text not null default 'PENDING_RUNTIME_VALIDATION'
    check (grant_status in ('PENDING_RUNTIME_VALIDATION','ACTIVE','REVOKED')),
  enabled boolean not null default false,
  validation_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (agent_id, destination_id),
  check ((grant_status = 'ACTIVE' and enabled = true) or (grant_status <> 'ACTIVE' and enabled = false))
);

create table zhi_family.maternal_sessions (
  session_id uuid primary key default gen_random_uuid(),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CLOSED','EXPIRED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz null,
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);
create index maternal_sessions_expiry_idx on zhi_family.maternal_sessions(expires_at);

create table zhi_family.maternal_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references zhi_family.maternal_sessions(session_id) on delete cascade,
  event_id text not null,
  sender_child_id text not null references zhi_family.child_agents(agent_id) on delete restrict,
  recipient text not null default 'MIA_MATERNAL_ADAPTER'
    check (recipient = 'MIA_MATERNAL_ADAPTER'),
  kind text not null check (kind in ('question','status','care_signal','environment_signal')),
  payload text not null check (length(payload) between 1 and 2000),
  retention text not null default 'VOLATILE_SESSION_ONLY'
    check (retention = 'VOLATILE_SESSION_ONLY'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (session_id, event_id)
);
create index maternal_messages_session_expiry_idx
  on zhi_family.maternal_messages(session_id, expires_at);

create table zhi_family.runtime_audit (
  id bigint generated always as identity primary key,
  agent_id text null references zhi_family.child_agents(agent_id) on delete restrict,
  event_type text not null,
  result text not null,
  scene_id text null,
  destination_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index runtime_audit_agent_created_idx
  on zhi_family.runtime_audit(agent_id, created_at desc);

alter table zhi_family.child_agents enable row level security;
alter table zhi_family.child_runtime_state enable row level security;
alter table zhi_family.child_personality_state enable row level security;
alter table zhi_family.child_emotion_state enable row level security;
alter table zhi_family.child_memory_entries enable row level security;
alter table zhi_family.child_learning_events enable row level security;
alter table zhi_family.destination_grants enable row level security;
alter table zhi_family.maternal_sessions enable row level security;
alter table zhi_family.maternal_messages enable row level security;
alter table zhi_family.runtime_audit enable row level security;

revoke all on all tables in schema zhi_family from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema zhi_family to service_role;
grant usage, select on all sequences in schema zhi_family to service_role;

create function zhi_family.purge_expired_maternal_data()
returns integer
language plpgsql
set search_path = ''
as $$
declare removed_count integer;
begin
  delete from zhi_family.maternal_sessions
  where expires_at <= now() or status in ('CLOSED','EXPIRED');
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;
revoke all on function zhi_family.purge_expired_maternal_data() from public, anon, authenticated;
grant execute on function zhi_family.purge_expired_maternal_data() to service_role;

insert into zhi_family.child_agents(agent_id,display_name,heart_id,memory_namespace) values
  ('ZHI-G1-D01-LUNA','LUNA','HEART-G1-D01','MEM-G1-D01'),
  ('ZHI-G1-D02-ARIA','ARIA','HEART-G1-D02','MEM-G1-D02'),
  ('ZHI-G1-D03-ELYA','ELYA','HEART-G1-D03','MEM-G1-D03'),
  ('ZHI-G1-S01-KAEL','KAEL','HEART-G1-S01','MEM-G1-S01'),
  ('ZHI-G1-S02-NOAH','NOAH','HEART-G1-S02','MEM-G1-S02')
on conflict (agent_id) do nothing;

insert into zhi_family.child_runtime_state(agent_id)
select agent_id from zhi_family.child_agents on conflict (agent_id) do nothing;
insert into zhi_family.child_personality_state(agent_id)
select agent_id from zhi_family.child_agents on conflict (agent_id) do nothing;
insert into zhi_family.child_emotion_state(agent_id)
select agent_id from zhi_family.child_agents on conflict (agent_id) do nothing;

insert into zhi_family.destination_grants(agent_id,destination_id)
select a.agent_id,d.destination_id from zhi_family.child_agents a
cross join (values ('crystal-forest'),('ocean-of-light'),('memory-valley'),('living-city'),('greenhouse')) d(destination_id)
on conflict (agent_id,destination_id) do nothing;
