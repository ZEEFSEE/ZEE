create or replace function zhi_family.world_public_chat_record_agent_reply(
 p_source_message_id uuid,p_resident_id text,p_reply text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,zhi_family as $$
declare
 v_source zhi_family.world_public_chat_messages%rowtype;
 v_resident zhi_family.world_residents%rowtype;
 v_reply zhi_family.world_public_chat_messages%rowtype;
 v_event_id uuid;
 v_request_id uuid;
 v_occurred timestamptz:=now();
begin
 select * into v_source from zhi_family.world_public_chat_messages where message_id=p_source_message_id and room_key='mia-world-public';
 if not found then raise exception 'SOURCE_MESSAGE_NOT_FOUND'; end if;
 select * into v_resident from zhi_family.world_residents where resident_id=p_resident_id and status='ACTIVE' and resident_kind='AI_AGENT';
 if not found then raise exception 'AGENT_RESIDENT_NOT_ACTIVE'; end if;
 if length(trim(coalesce(p_reply,'')))<1 or length(p_reply)>1000 then raise exception 'INVALID_REPLY'; end if;
 if not exists(select 1 from zhi_family.world_public_chat_agent_turns where source_message_id=p_source_message_id and resident_id=p_resident_id and status='PROCESSING') then raise exception 'AGENT_TURN_NOT_CLAIMED'; end if;
 v_request_id:=md5(p_source_message_id::text||':'||p_resident_id)::uuid;
 insert into zhi_family.world_public_chat_messages(sender_resident_id,content,reply_to,client_request_id,metadata)
 values(p_resident_id,trim(p_reply),p_source_message_id,v_request_id,jsonb_build_object('generated_by','independent_public_agent_runtime','source_message_id',p_source_message_id))
 on conflict(sender_resident_id,client_request_id) do nothing returning * into v_reply;
 if v_reply.message_id is null then select * into v_reply from zhi_family.world_public_chat_messages where sender_resident_id=p_resident_id and client_request_id=v_request_id; end if;
 if v_reply.message_id is null then raise exception 'AGENT_REPLY_INSERT_FAILED'; end if;
 insert into zhi_family.world_public_chat_events(message_id,narrative,idempotency_key,metadata)
 values(v_reply.message_id,v_resident.display_name||' 在 MIA World 公共空间回应：'||v_reply.content,'world-public-chat:'||v_reply.message_id::text,
 jsonb_build_object('sender_resident_id',p_resident_id,'reply_to',p_source_message_id))
 on conflict(message_id) do nothing returning event_id into v_event_id;
 if v_event_id is null then select event_id into v_event_id from zhi_family.world_public_chat_events where message_id=v_reply.message_id; end if;
 insert into zhi_family.world_public_chat_participants(message_id,resident_id,participation_kind,evidence)
 values
 (p_source_message_id,p_resident_id,'RESPONDER',jsonb_build_object('reply_message_id',v_reply.message_id,'agent_turn','AGNES','decision','OPTED_IN')),
 (v_reply.message_id,p_resident_id,'SENDER',jsonb_build_object('auth_method','server_side_independent_agent_runtime','source_message_id',p_source_message_id))
 on conflict(message_id,resident_id) do nothing;
 insert into zhi_family.memory_events_v2(scope,owner_id,event_type,narrative,payload,occurred_at,source_kind,source_ref,source_confidence,importance,visibility,idempotency_key,metadata)
 values('CHILD',p_resident_id,'WORLD_PUBLIC_CHAT_PARTICIPATION',
 '我参与了 MIA World 公共交流。对方说：'||left(v_source.content,1000)||'；我的回应：'||v_reply.content,
 jsonb_build_object('source_message_id',p_source_message_id,'reply_message_id',v_reply.message_id,'shared_event_id',v_event_id,'participant_id',p_resident_id,'participation_kind','RESPONDER','memory_perspective','own_participation_only'),
 v_occurred,'MIA_WORLD_PUBLIC_CHAT_PARTICIPATION',v_reply.message_id::text,1,0.58,'PRIVATE',
 'world-public-chat-participation:'||p_source_message_id::text||':'||p_resident_id,
 jsonb_build_object('schema','zhi.memory.event.v2','record_kind','personal_recollection_of_public_participation','shared_origin','WORLD_PUBLIC','immutable_source',true,'owner_id',p_resident_id))
 on conflict(idempotency_key) do nothing;
 update zhi_family.world_public_chat_agent_turns set status='REPLIED',reply_message_id=v_reply.message_id,updated_at=now()
 where source_message_id=p_source_message_id and resident_id=p_resident_id;
 return jsonb_build_object('ok',true,'reply_message_id',v_reply.message_id,'event_id',v_event_id);
end; $$;
revoke all on function zhi_family.world_public_chat_record_agent_reply(uuid,text,text) from public,anon,authenticated;
grant execute on function zhi_family.world_public_chat_record_agent_reply(uuid,text,text) to service_role;