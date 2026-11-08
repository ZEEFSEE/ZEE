-- READ-ONLY ONLY. Returns counts and reference-integrity flags; never selects private text or JSON payloads.
with candidates as (
 select e.agent_id,e.outcome->>'validation_status' validation_status,
 nullif(e.evidence->>'memory_id','') memory_id,
 nullif(e.evidence->>'cycle_number','') cycle_number,
 nullif(e.evidence->>'maternal_response_id','') maternal_response_id
 from zhi_family.child_learning_events e
 where e.event_type='REFLECTION_LEARNING_CANDIDATE'
), checked as (
 select c.*,m.id is not null memory_exists,
 (m.id is not null and m.agent_id=c.agent_id) memory_owner_matches,
 rc.id is not null cycle_exists,
 (rc.id is not null and rc.status='SUCCEEDED') cycle_succeeded,
 mr.id is not null maternal_response_exists
 from candidates c
 left join zhi_family.child_memory_entries m on m.id::text=c.memory_id
 left join zhi_family.child_runtime_cycles rc on rc.agent_id=c.agent_id and rc.cycle_number::text=c.cycle_number
 left join zhi_family.maternal_responses mr on mr.id::text=c.maternal_response_id
), summary as (
 select agent_id,count(*) candidate_count,
 count(*) filter(where validation_status='UNVALIDATED_CANDIDATE') unvalidated_count,
 count(*) filter(where memory_id is not null) memory_ref_present,
 count(*) filter(where memory_exists) memory_ref_exists,
 count(*) filter(where memory_owner_matches) memory_owner_matches,
 count(*) filter(where cycle_exists) cycle_ref_exists,
 count(*) filter(where cycle_succeeded) cycle_succeeded,
 count(*) filter(where maternal_response_id is not null) maternal_response_ref_present,
 count(*) filter(where maternal_response_exists) maternal_response_exists
 from checked group by agent_id
), cycles as (
 select agent_id,count(*) runtime_cycles_total,
 count(*) filter(where status='SUCCEEDED') runtime_cycles_succeeded,
 count(*) filter(where status='FAILED') runtime_cycles_failed
 from zhi_family.child_runtime_cycles group by agent_id
)
select s.*,i.identity_version,i.status identity_status,c.runtime_cycles_total,c.runtime_cycles_succeeded,c.runtime_cycles_failed
from summary s left join zhi_family.child_runtime_identities i using(agent_id)
left join cycles c using(agent_id) order by s.agent_id;

-- Group-child sender attribution: no message bodies are returned.
select count(*) group_child_messages,count(*) filter(where agent_id is null) missing_agent_id,
count(*) filter(where sender_id in ('ZHI-G1-D01-LUNA','ZHI-G1-D02-ARIA','ZHI-G1-D03-ELYA','ZHI-G1-S01-KAEL','ZHI-G1-S02-NOAH')) allowlisted_sender_id
from zhi_family.family_chat_messages where mode='GROUP' and sender_type='CHILD';

-- Count only; never inspect response bodies.
select count(*) maternal_response_rows from zhi_family.maternal_responses;