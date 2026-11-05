create table zhi_family.maternal_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references zhi_family.maternal_sessions(session_id) on delete cascade,
  event_id text not null,
  recipient_child_id text not null references zhi_family.child_agents(agent_id) on delete restrict,
  kind text not null check (kind in ('response','care_signal','environment_signal')),
  payload text not null check (length(payload) between 1 and 2000),
  retention text not null default 'VOLATILE_SESSION_ONLY'
    check (retention = 'VOLATILE_SESSION_ONLY'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (session_id,event_id)
);
create index maternal_responses_session_expiry_idx
  on zhi_family.maternal_responses(session_id,expires_at);
alter table zhi_family.maternal_responses enable row level security;
revoke all on zhi_family.maternal_responses from public, anon, authenticated;
grant select, insert, update, delete on zhi_family.maternal_responses to service_role;
