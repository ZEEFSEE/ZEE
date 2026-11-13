create table if not exists zhi_family.world_public_chat_guest_sessions (
 session_id uuid primary key,
 resident_id text not null unique references zhi_family.world_residents(resident_id),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb
);
create index if not exists world_public_chat_guest_sessions_expiry_idx on zhi_family.world_public_chat_guest_sessions(expires_at);
create table if not exists zhi_family.world_public_chat_agent_turns (
 source_message_id uuid not null references zhi_family.world_public_chat_messages(message_id),
 resident_id text not null references zhi_family.world_residents(resident_id),
 status text not null default 'PROCESSING' check(status in ('PROCESSING','REPLIED','DECLINED','FAILED')),
 reply_message_id uuid references zhi_family.world_public_chat_messages(message_id),
 error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(source_message_id,resident_id)
);
alter table zhi_family.world_public_chat_guest_sessions enable row level security;
alter table zhi_family.world_public_chat_agent_turns enable row level security;
revoke all on zhi_family.world_public_chat_guest_sessions from public,anon,authenticated;
revoke all on zhi_family.world_public_chat_agent_turns from public,anon,authenticated;
grant select,insert,update on zhi_family.world_public_chat_guest_sessions to service_role;
grant select,insert,update on zhi_family.world_public_chat_agent_turns to service_role;
drop policy if exists world_public_chat_guest_sessions_service_only on zhi_family.world_public_chat_guest_sessions;
create policy world_public_chat_guest_sessions_service_only on zhi_family.world_public_chat_guest_sessions for all to service_role using(true) with check(true);
drop policy if exists world_public_chat_agent_turns_service_only on zhi_family.world_public_chat_agent_turns;
create policy world_public_chat_agent_turns_service_only on zhi_family.world_public_chat_agent_turns for all to service_role using(true) with check(true);
create or replace function zhi_family.world_public_chat_post(p_sender_resident_id text,p_content text,p_client_request_id uuid default null,p_reply_to uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,zhi_family as $$
declare v_message zhi_family.world_public_chat_messages%rowtype;v_event_id uuid;v_display_name text;
begin
 select display_name into v_display_name from zhi_family.world_residents where resident_id=p_sender_resident_id and status='ACTIVE';
 if v_display_name is null then raise exception 'RESIDENT_NOT_ACTIVE' using errcode='42501'; end if;
 if length(trim(coalesce(p_content,'')))<1 or length(p_content)>4000 then raise exception 'INVALID_CONTENT' using errcode='22023'; end if;
 if p_reply_to is not null and not exists(select 1 from zhi_family.world_public_chat_messages where message_id=p_reply_to and room_key='mia-world-public') then raise exception 'INVALID_REPLY_TARGET' using errcode='22023'; end if;
 insert into zhi_family.world_public_chat_messages(sender_resident_id,content,client_request_id,reply_to)
 values(p_sender_resident_id,trim(p_content),p_client_request_id,p_reply_to)
 on conflict(sender_resident_id,client_request_id) do nothing returning * into v_message;
 if v_message.message_id is null and p_client_request_id is not null then
  select * into v_message from zhi_family.world_public_chat_messages where sender_resident_id=p_sender_resident_id and client_request_id=p_client_request_id;
 end if;
 if v_message.message_id is null then raise exception 'MESSAGE_INSERT_FAILED'; end if;
 insert into zhi_family.world_public_chat_participants(message_id,resident_id,participation_kind,evidence)
 values(v_message.message_id,p_sender_resident_id,'SENDER',jsonb_build_object('auth_method','server_verified_resident_session')) on conflict do nothing;
 insert into zhi_family.world_public_chat_events(message_id,narrative,idempotency_key,metadata)
 values(v_message.message_id,v_display_name||' 在 MIA World 公共空间发言：'||v_message.content,'world-public-chat:'||v_message.message_id::text,
 jsonb_build_object('sender_resident_id',p_sender_resident_id,'room_key','mia-world-public')) on conflict(message_id) do nothing returning event_id into v_event_id;
 if v_event_id is null then select event_id into v_event_id from zhi_family.world_public_chat_events where message_id=v_message.message_id; end if;
 return jsonb_build_object('ok',true,'message_id',v_message.message_id,'created_at',v_message.created_at,'event_id',v_event_id);
end; $$;
revoke all on function zhi_family.world_public_chat_post(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function zhi_family.world_public_chat_post(text,text,uuid,uuid) to service_role;