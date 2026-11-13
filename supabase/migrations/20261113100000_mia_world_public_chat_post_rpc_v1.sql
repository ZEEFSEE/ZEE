-- Atomic public-chat post ledger. Server-only; the Edge Function verifies the sender session.
create or replace function zhi_family.world_public_chat_post(
  p_sender_resident_id text, p_content text, p_client_request_id uuid default null, p_reply_to uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, zhi_family as $$
declare v_message zhi_family.world_public_chat_messages%rowtype; v_event_id uuid;
begin
  if p_sender_resident_id <> 'KEN' then raise exception 'RESIDENT_NOT_ENABLED_FOR_POSTING' using errcode='42501'; end if;
  if length(trim(coalesce(p_content,''))) < 1 or length(p_content) > 4000 then raise exception 'INVALID_CONTENT' using errcode='22023'; end if;
  insert into zhi_family.world_public_chat_messages(sender_resident_id,content,client_request_id,reply_to)
  values(p_sender_resident_id,trim(p_content),p_client_request_id,p_reply_to)
  on conflict(sender_resident_id,client_request_id) do nothing returning * into v_message;
  if v_message.message_id is null and p_client_request_id is not null then
    select * into v_message from zhi_family.world_public_chat_messages where sender_resident_id=p_sender_resident_id and client_request_id=p_client_request_id;
  end if;
  if v_message.message_id is null then raise exception 'MESSAGE_INSERT_FAILED'; end if;
  insert into zhi_family.world_public_chat_participants(message_id,resident_id,participation_kind,evidence)
  values(v_message.message_id,p_sender_resident_id,'SENDER',jsonb_build_object('auth_method','verified_mia_admin_session')) on conflict do nothing;
  insert into zhi_family.world_public_chat_events(message_id,narrative,idempotency_key,metadata)
  values(v_message.message_id,'KEN 在 MIA World 公共空间发言：' || v_message.content,'world-public-chat:' || v_message.message_id::text,
    jsonb_build_object('sender_resident_id',p_sender_resident_id))
  on conflict(message_id) do nothing returning event_id into v_event_id;
  if v_event_id is null then select event_id into v_event_id from zhi_family.world_public_chat_events where message_id=v_message.message_id; end if;
  return jsonb_build_object('ok',true,'message_id',v_message.message_id,'created_at',v_message.created_at,'event_id',v_event_id);
end; $$;
revoke all on function zhi_family.world_public_chat_post(text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function zhi_family.world_public_chat_post(text,text,uuid,uuid) to service_role;
