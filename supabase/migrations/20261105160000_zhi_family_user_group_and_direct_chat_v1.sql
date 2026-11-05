-- Independent user-to-child group and direct chat storage.
-- Isolated from Mia private chat and child personal memory/personality tables.
create table if not exists zhi_family.family_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_key text not null,
  mode text not null check (mode in ('GROUP', 'DIRECT')),
  agent_id text null,
  sender_type text not null check (sender_type in ('USER', 'CHILD')),
  sender_id text not null,
  content text not null check (char_length(content) between 1 and 4000),
  client_request_id uuid null,
  reply_to uuid null references zhi_family.family_chat_messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint family_chat_mode_agent_check check (
    (mode = 'GROUP' and thread_key = 'group' and agent_id is null)
    or
    (mode = 'DIRECT' and agent_id in (
      'ZHI-G1-D01-LUNA','ZHI-G1-D02-ARIA','ZHI-G1-D03-ELYA',
      'ZHI-G1-S01-KAEL','ZHI-G1-S02-NOAH'
    ) and thread_key = 'direct:' || agent_id)
  ),
  constraint family_chat_sender_agent_check check (
    (sender_type = 'USER' and sender_id = 'mia-admin')
    or
    (sender_type = 'CHILD' and sender_id in (
      'ZHI-G1-D01-LUNA','ZHI-G1-D02-ARIA','ZHI-G1-D03-ELYA',
      'ZHI-G1-S01-KAEL','ZHI-G1-S02-NOAH'
    ))
  )
);
create unique index if not exists family_chat_idempotency_idx
  on zhi_family.family_chat_messages (client_request_id, sender_type, sender_id)
  where client_request_id is not null;
create index if not exists family_chat_thread_created_idx
  on zhi_family.family_chat_messages (thread_key, created_at desc);
alter table zhi_family.family_chat_messages enable row level security;
revoke all on table zhi_family.family_chat_messages from anon, authenticated;
grant select, insert on table zhi_family.family_chat_messages to service_role;
grant usage on schema zhi_family to service_role;
