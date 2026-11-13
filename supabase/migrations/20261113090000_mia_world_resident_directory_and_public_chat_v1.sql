-- MIA World resident directory and isolated public-chat ledger v1.
-- Additive only: child_agents, family_chat_messages and existing memory records are untouched.
create table if not exists zhi_family.world_residents (
  resident_id text primary key,
  display_name text not null,
  resident_kind text not null check (resident_kind in ('PERSON','AI_AGENT')),
  source_schema text not null,
  source_table text not null,
  source_key text not null,
  memory_scope text,
  memory_owner_id text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','LEFT','PENDING_IDENTITY')),
  joined_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_schema, source_table, source_key),
  check ((memory_scope is null) = (memory_owner_id is null))
);

create table if not exists zhi_family.world_public_chat_messages (
  message_id uuid primary key default gen_random_uuid(),
  room_key text not null default 'mia-world-public',
  sender_resident_id text not null references zhi_family.world_residents(resident_id),
  content text not null check (char_length(content) between 1 and 4000),
  reply_to uuid references zhi_family.world_public_chat_messages(message_id),
  client_request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (sender_resident_id, client_request_id)
);

create table if not exists zhi_family.world_public_chat_participants (
  message_id uuid not null references zhi_family.world_public_chat_messages(message_id) on delete restrict,
  resident_id text not null references zhi_family.world_residents(resident_id),
  participation_kind text not null check (participation_kind in ('SENDER','RESPONDER','EXPLICITLY_PRESENT')),
  recorded_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  primary key (message_id, resident_id)
);

create table if not exists zhi_family.world_public_chat_events (
  event_id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references zhi_family.world_public_chat_messages(message_id) on delete restrict,
  event_type text not null default 'WORLD_PUBLIC_CHAT_TURN',
  narrative text not null,
  occurred_at timestamptz not null default now(),
  visibility text not null default 'WORLD_PUBLIC' check (visibility = 'WORLD_PUBLIC'),
  source_kind text not null default 'MIA_WORLD_PUBLIC_CHAT',
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists world_public_chat_messages_room_created_idx
  on zhi_family.world_public_chat_messages(room_key, created_at desc);
create index if not exists world_public_chat_participants_resident_idx
  on zhi_family.world_public_chat_participants(resident_id, recorded_at desc);

alter table zhi_family.world_residents enable row level security;
alter table zhi_family.world_public_chat_messages enable row level security;
alter table zhi_family.world_public_chat_participants enable row level security;
alter table zhi_family.world_public_chat_events enable row level security;

revoke all on zhi_family.world_residents from anon, authenticated;
revoke all on zhi_family.world_public_chat_messages from anon, authenticated;
revoke all on zhi_family.world_public_chat_participants from anon, authenticated;
revoke all on zhi_family.world_public_chat_events from anon, authenticated;

grant select, insert, update on zhi_family.world_residents to service_role;
grant select, insert, update on zhi_family.world_public_chat_messages to service_role;
grant select, insert, update on zhi_family.world_public_chat_participants to service_role;
grant select, insert, update on zhi_family.world_public_chat_events to service_role;

drop policy if exists service_role_all_world_residents on zhi_family.world_residents;
create policy service_role_all_world_residents on zhi_family.world_residents
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_world_public_chat_messages on zhi_family.world_public_chat_messages;
create policy service_role_all_world_public_chat_messages on zhi_family.world_public_chat_messages
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_world_public_chat_participants on zhi_family.world_public_chat_participants;
create policy service_role_all_world_public_chat_participants on zhi_family.world_public_chat_participants
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_world_public_chat_events on zhi_family.world_public_chat_events;
create policy service_role_all_world_public_chat_events on zhi_family.world_public_chat_events
  for all to service_role using (true) with check (true);

-- Register only identities with an existing authoritative source.
insert into zhi_family.world_residents
  (resident_id, display_name, resident_kind, source_schema, source_table, source_key, memory_scope, memory_owner_id, status, metadata)
select ca.agent_id, ca.display_name, 'AI_AGENT', 'zhi_family', 'child_agents', ca.agent_id,
       'CHILD', ca.agent_id, 'ACTIVE',
       jsonb_build_object('heart_id',ca.heart_id,'memory_namespace',ca.memory_namespace,
         'lifecycle_state',ca.lifecycle_state,'runtime_status',ca.runtime_status,
         'identity_source','existing_child_agents')
from zhi_family.child_agents ca
on conflict (resident_id) do update set display_name=excluded.display_name, status='ACTIVE',
  metadata=zhi_family.world_residents.metadata || excluded.metadata, updated_at=now();

insert into zhi_family.world_residents
  (resident_id, display_name, resident_kind, source_schema, source_table, source_key, memory_scope, memory_owner_id, status, metadata)
select 'MIA', mi.display_name, 'AI_AGENT', 'public', 'mia_identity', mi.id::text,
       null, null, 'ACTIVE',
       jsonb_build_object('source_agent_id',mi.source_agent_id,'source_project',mi.source_project,
         'identity_root_id',cr.identity_id,'identity_version',cr.current_identity_version,
         'identity_source','existing_mia_identity_and_cim_root','private_memory_not_migrated',true)
from public.mia_identity mi
left join zhi_family.cim_identity_roots cr on cr.identity_id=mi.id
where mi.id='cb6d01b4-0e3f-46ee-8946-360aa91db1ea'
on conflict (resident_id) do update set display_name=excluded.display_name, status='ACTIVE',
  metadata=zhi_family.world_residents.metadata || excluded.metadata, updated_at=now();

insert into zhi_family.world_residents
  (resident_id, display_name, resident_kind, source_schema, source_table, source_key, memory_scope, memory_owner_id, status, metadata)
select 'KEN', s.display_name, 'PERSON', 'zhi_family', 'identity_subjects', s.subject_key,
       null, null, 'ACTIVE',
       jsonb_build_object('identity_id',s.identity_id,'subject_kind',s.subject_kind,
         'identity_source','existing_identity_subjects')
from zhi_family.identity_subjects s where s.subject_key='KEN' and s.status='ACTIVE'
on conflict (resident_id) do update set display_name=excluded.display_name, status='ACTIVE',
  metadata=zhi_family.world_residents.metadata || excluded.metadata, updated_at=now();
