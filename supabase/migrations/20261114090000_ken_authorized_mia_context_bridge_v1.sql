-- KEN authorized MIA conversation bridge v1
-- Additive only: no changes to MIA identity, personality, original messages, or AGNES configuration.
-- Sharing is OFF by default. The KEN owner must explicitly enable the all-session grant in KEN chat.

create table if not exists zhi_family.ken_shared_context_grants (
  grant_id uuid primary key default gen_random_uuid(),
  ken_identity_id uuid not null references zhi_family.ken_identity_roots(identity_id) on delete restrict,
  mia_identity_id uuid not null references public.mia_identity(id) on delete restrict,
  scope text not null default 'ALL_SESSIONS' check (scope = 'ALL_SESSIONS'),
  status text not null default 'BACKFILLING' check (status in ('BACKFILLING','ACTIVE','REVOKED','FAILED')),
  granted_by text not null default 'MIA_ACCOUNT_OWNER',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  backfill_status text not null default 'PENDING' check (backfill_status in ('PENDING','RUNNING','COMPLETE','PARTIAL','FAILED','REVOKED')),
  backfilled_count bigint not null default 0 check (backfilled_count >= 0),
  last_backfill_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check ((status = 'REVOKED' and revoked_at is not null) or (status <> 'REVOKED' and revoked_at is null))
);

create unique index if not exists ken_shared_context_one_active_all_sessions
  on zhi_family.ken_shared_context_grants (ken_identity_id)
  where scope = 'ALL_SESSIONS' and status in ('BACKFILLING','ACTIVE');

create index if not exists ken_shared_context_grants_mia_identity_idx
  on zhi_family.ken_shared_context_grants (mia_identity_id, status, granted_at desc);

create table if not exists zhi_family.ken_shared_context_messages (
  shared_message_id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references zhi_family.ken_shared_context_grants(grant_id) on delete restrict,
  ken_identity_id uuid not null references zhi_family.ken_identity_roots(identity_id) on delete restrict,
  mia_identity_id uuid not null references public.mia_identity(id) on delete restrict,
  mia_session_id uuid not null references public.mia_chat_sessions(id) on delete restrict,
  source_message_id uuid not null references public.mia_messages(id) on delete restrict,
  speaker_role text not null check (speaker_role in ('user','assistant')),
  content text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (grant_id, source_message_id)
);

create index if not exists ken_shared_context_messages_identity_time_idx
  on zhi_family.ken_shared_context_messages (ken_identity_id, occurred_at desc);

create index if not exists ken_shared_context_messages_grant_time_idx
  on zhi_family.ken_shared_context_messages (grant_id, occurred_at desc);

alter table zhi_family.ken_shared_context_grants enable row level security;
alter table zhi_family.ken_shared_context_messages enable row level security;

revoke all on zhi_family.ken_shared_context_grants from anon, authenticated;
revoke all on zhi_family.ken_shared_context_messages from anon, authenticated;
grant select, insert, update on zhi_family.ken_shared_context_grants to service_role;
grant select, insert, update on zhi_family.ken_shared_context_messages to service_role;

drop policy if exists ken_shared_context_grants_service_role_all on zhi_family.ken_shared_context_grants;
create policy ken_shared_context_grants_service_role_all
  on zhi_family.ken_shared_context_grants
  for all to service_role using (true) with check (true);

drop policy if exists ken_shared_context_messages_service_role_all on zhi_family.ken_shared_context_messages;
create policy ken_shared_context_messages_service_role_all
  on zhi_family.ken_shared_context_messages
  for all to service_role using (true) with check (true);

create or replace function zhi_family.capture_authorized_mia_message_for_ken()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, zhi_family, public
as $$
begin
  if new.role not in ('user','assistant') then
    return new;
  end if;

  insert into zhi_family.ken_shared_context_messages (
    grant_id, ken_identity_id, mia_identity_id, mia_session_id,
    source_message_id, speaker_role, content, occurred_at, metadata
  )
  select
    g.grant_id, g.ken_identity_id, g.mia_identity_id, new.session_id,
    new.id, new.role, new.content, new.created_at,
    jsonb_build_object(
      'source_system', 'MIA_PRIVATE_CHAT',
      'source_message_id', new.id,
      'source_session_id', new.session_id,
      'original_metadata_omitted', true,
      'attachments_copied', false
    )
  from zhi_family.ken_shared_context_grants g
  join public.mia_chat_sessions s
    on s.id = new.session_id
   and s.identity_id = g.mia_identity_id
  where g.scope = 'ALL_SESSIONS'
    and g.status in ('BACKFILLING','ACTIVE')
  on conflict (grant_id, source_message_id) do nothing;

  return new;
end;
$$;

revoke all on function zhi_family.capture_authorized_mia_message_for_ken() from public, anon, authenticated;

drop trigger if exists mia_messages_capture_authorized_ken_context on public.mia_messages;
create trigger mia_messages_capture_authorized_ken_context
  after insert on public.mia_messages
  for each row
  execute function zhi_family.capture_authorized_mia_message_for_ken();

comment on table zhi_family.ken_shared_context_grants is
  'Explicit account-owner grants allowing KEN to retrieve selected MIA conversation text. Disabled by default; does not grant access to MIA private memories or child-private chats.';
comment on table zhi_family.ken_shared_context_messages is
  'Append-only copies of user/assistant text messages from explicitly shared MIA sessions. Original MIA messages remain authoritative; attachments and metadata are not copied.';
