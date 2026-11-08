-- READ-ONLY PRODUCTION AUDIT. No private content, narratives, memory text, or JSON payloads are selected.
with child_ids(agent_id,subject) as (values
 ('ZHI-G1-D01-LUNA','LUNA'),('ZHI-G1-D02-ARIA','ARIA'),('ZHI-G1-D03-ELYA','ELYA'),('ZHI-G1-S01-KAEL','KAEL'),('ZHI-G1-S02-NOAH','NOAH')),
child_stats as (
 select ci.subject,ci.agent_id,coalesce(i.identity_version,0) identity_version,coalesce(i.status,'MISSING') identity_status,
 count(e.id) filter(where e.event_type='REFLECTION_LEARNING_CANDIDATE') candidate_count,
 count(e.id) filter(where e.event_type='REFLECTION_LEARNING_CANDIDATE' and e.outcome->>'validation_status'='UNVALIDATED_CANDIDATE') unvalidated_count,
 count(e.id) filter(where e.event_type='REFLECTION_LEARNING_CANDIDATE' and nullif(e.evidence->>'memory_event_id','') is not null and nullif(e.evidence->>'runtime_cycle_id','') is not null) both_refs_present
 from child_ids ci left join zhi_family.child_runtime_identities i on i.agent_id=ci.agent_id
 left join zhi_family.child_learning_events e on e.agent_id=ci.agent_id group by ci.subject,ci.agent_id,i.identity_version,i.status
),chat as (
 select count(*) total,count(*) filter(where agent_id is null) agent_id_null,count(*) filter(where agent_id=sender_id) agent_matches_sender
 from zhi_family.family_chat_messages where mode='GROUP' and sender_type='CHILD' and created_at >= '2026-11-08T08:48:58Z'::timestamptz
)
select jsonb_build_object('as_of',now(),
 'mia',jsonb_build_object('identity_rows',(select count(*) from public.mia_identity),'memory_rows',(select count(*) from public.mia_memories),'life_event_rows',(select count(*) from public.mia_life_events)),
 'children',(select jsonb_agg(to_jsonb(c) order by c.subject) from child_stats c),
 'family_chat_post_deploy',(select to_jsonb(chat) from chat),
 'candidate_total',(select sum(candidate_count) from child_stats),
 'candidate_unvalidated',(select sum(unvalidated_count) from child_stats),
 'capability_promotions',0,'production_writes_performed',false) as audit_snapshot;
