-- Mia automatic growth: aggregate-only, idempotent seven-day snapshots.
-- Does not read message or memory bodies and does not mutate mia_personality_state.
create or replace function mia_private.run_mia_auto_growth()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,mia_private as $$
declare
 v_identity uuid:='cb6d01b4-0e3f-46ee-8946-360aa91db1ea';
 v_end timestamptz:=now(); v_start timestamptz:=now()-interval '7 days';
 v_emotions int:=0; v_life int:=0; v_chat int:=0; v_pos int:=0; v_neg int:=0; v_intense int:=0; v_dedup int:=0;
 v_health text:='healthy'; v_decision text:='observe_only_insufficient_evidence';
 v_state jsonb; v_active jsonb; v_run uuid; v_ver bigint; v_changed boolean:=false;
begin
 select count(*) into v_emotions from (
  select distinct coalesce(source_table,'mia_emotion_events')||':'||coalesce(source_record_id,id::text) k
  from public.mia_emotion_events where identity_id=v_identity and coalesce(occurred_at,created_at) between v_start and v_end
 ) q;
 select count(*) into v_pos from public.mia_emotion_events where identity_id=v_identity and coalesce(occurred_at,created_at) between v_start and v_end and valence>0;
 select count(*) into v_neg from public.mia_emotion_events where identity_id=v_identity and coalesce(occurred_at,created_at) between v_start and v_end and valence<0;
 select count(*) into v_intense from public.mia_emotion_events where identity_id=v_identity and coalesce(occurred_at,created_at) between v_start and v_end and intensity>=0.85;
 select count(*) into v_life from public.mia_life_events where identity_id=v_identity and coalesce(occurred_at,created_at) between v_start and v_end;
 select count(*) into v_chat from public.mia_messages m join public.mia_chat_sessions s on s.id=m.session_id where s.identity_id=v_identity and m.created_at between v_start and v_end;
 select greatest(0,count(*)-count(distinct coalesce(source_table,'mia_emotion_events')||':'||coalesce(source_record_id,id::text))) into v_dedup
 from public.mia_emotion_events where identity_id=v_identity and coalesce(occurred_at,created_at) between v_start and v_end;
 select state into v_active from public.mia_growth_state_versions where identity_id=v_identity and status='active' order by version desc limit 1;
 if v_active is null then v_active:=jsonb_build_object('schema_version','1.0','growth_mode','automatic_observer'); end if;
 v_state:=jsonb_set(v_active,'{latest_window_positive_events}',to_jsonb(v_pos),true);
 v_state:=jsonb_set(v_state,'{latest_window_negative_events}',to_jsonb(v_neg),true);
 v_state:=jsonb_set(v_state,'{latest_window_extreme_events}',to_jsonb(v_intense),true);
 v_state:=jsonb_set(v_state,'{evidence_window_days}',to_jsonb(7),true);
 v_state:=jsonb_set(v_state,'{human_approval_required_for}',jsonb_build_array('irreversible_change','privacy_security_boundary','core_principle','external_side_effect'),true);
 v_changed:=v_active->>'latest_window_positive_events' is distinct from v_pos::text
  or v_active->>'latest_window_negative_events' is distinct from v_neg::text
  or v_active->>'latest_window_extreme_events' is distinct from v_intense::text
  or v_active->>'evidence_window_days' is distinct from '7';
 if v_emotions+v_life+v_chat=0 then v_health:='no_recent_source_events'; v_decision:='observe_only_no_new_evidence';
 elsif v_intense>0 then v_decision:='extreme_event_reflection_recorded_reversible_only';
 elsif v_pos+v_neg>0 then v_decision:='automatic_reflection_recorded';
 else v_decision:='automatic_reflection_recorded_no_emotion_signal'; end if;
 insert into public.mia_growth_runs(identity_id,window_start,window_end,emotion_event_count,life_event_count,chat_message_count,positive_event_count,negative_event_count,intense_event_count,deduplicated_event_count,decision,applied_change,source_health)
 values(v_identity,v_start,v_end,v_emotions,v_life,v_chat,v_pos,v_neg,v_intense,v_dedup,v_decision,
 jsonb_build_object('state_updated',v_changed,'personality_state_modified',false,'raw_chat_content_read',false,'raw_memory_content_read',false,'window_counts_replace_not_accumulate',true),v_health)
 returning run_id into v_run;
 if v_changed then
  v_state:=jsonb_set(v_state,'{last_reflection_at}',to_jsonb(v_end),true);
  update public.mia_growth_state_versions set status='superseded' where identity_id=v_identity and status='active';
  insert into public.mia_growth_state_versions(identity_id,state,status,source_run_id,reason)
  values(v_identity,v_state,'active',v_run,'Scheduled aggregate-only reflection; idempotent rolling-window snapshot') returning version into v_ver;
 else
  select version into v_ver from public.mia_growth_state_versions where identity_id=v_identity and status='active' order by version desc limit 1;
 end if;
 return jsonb_build_object('ok',true,'run_id',v_run,'state_version',v_ver,'new_version_created',v_changed,'decision',v_decision,'source_health',v_health,
 'counts',jsonb_build_object('emotion_events',v_emotions,'life_events',v_life,'chat_messages',v_chat,'positive',v_pos,'negative',v_neg,'intense',v_intense,'deduplicated',v_dedup),
 'privacy',jsonb_build_object('raw_chat_content_read',false,'raw_memory_content_read',false,'personality_state_modified',false));
end $$;
revoke all on function mia_private.run_mia_auto_growth() from public,anon,authenticated;
grant execute on function mia_private.run_mia_auto_growth() to postgres,service_role;
