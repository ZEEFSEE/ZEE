const PARTICIPANTS = Object.freeze({
  MIA: "AI_AGENT", LUNA: "AI_AGENT", ARIA: "AI_AGENT", ELYA: "AI_AGENT",
  KAEL: "AI_AGENT", NOAH: "AI_AGENT", KEN: "HUMAN_PARTICIPANT"
});
const EVIDENCE = new Set(["OBSERVED","USER_STATED","DERIVED","MODEL_ESTIMATE","UNKNOWN"]);
const SHARE_SCOPES = new Set(["FAMILY","EXPLICIT_SHARE"]);
const CONSENSUS_QUORUM = 4;
const VERIFIED_EVIDENCE = new Set(["OBSERVED","USER_STATED","DERIVED"]);

function denied(code){return Object.freeze({accepted:false,code});}
function cleanText(v){return typeof v==="string"&&v.trim()?v.trim():null;}
function uniqueStrings(v){return Array.isArray(v)?[...new Set(v.filter(cleanText).map(x=>x.trim()))]:[];}

/**
 * Deterministic deliberation over already-authored, synthetic participant contributions.
 * This does not generate thoughts or call an agent; it validates and aggregates supplied inputs.
 */
export function validateContribution(c, policy={}) {
  if(!c||typeof c!=="object"||Array.isArray(c))return denied("INVALID_CONTRIBUTION");
  if(!Object.hasOwn(PARTICIPANTS,c.subject_id))return denied("UNKNOWN_PARTICIPANT");
  if(!cleanText(c.claim_id)||!cleanText(c.issue_id)||!cleanText(c.position_key)||!cleanText(c.statement))return denied("MISSING_CLAIM_FIELDS");
  if(!SHARE_SCOPES.has(c.scope))return denied("PRIVATE_OR_UNSHARED_SCOPE");
  if(c.scope==="FAMILY"&&policy.family_source_verified!==true)return denied("FAMILY_SOURCE_NOT_VERIFIED");
  if(c.scope==="EXPLICIT_SHARE"){
    if(!cleanText(c.consent_ref)||!Array.isArray(c.approved_recipients)||!c.approved_recipients.includes("SEVEN_BRAIN_DELIBERATION"))return denied("EXPLICIT_CONSENT_REQUIRED");
  }
  if(!EVIDENCE.has(c.evidence_status))return denied("INVALID_EVIDENCE_STATUS");
  const evidence_refs=uniqueStrings(c.evidence_refs);
  if(!evidence_refs.length)return denied("EVIDENCE_REFERENCE_REQUIRED");
  if(typeof c.confidence!=="number"||!Number.isFinite(c.confidence)||c.confidence<0||c.confidence>1)return denied("INVALID_CONFIDENCE");
  if(!cleanText(c.uncertainty))return denied("UNCERTAINTY_REQUIRED");
  if(c.subject_id==="KEN"&&c.participant_kind!=="HUMAN_PARTICIPANT")return denied("KEN_MUST_REMAIN_HUMAN");
  if(c.subject_id!=="KEN"&&c.participant_kind!=="AI_AGENT")return denied("AI_PARTICIPANT_KIND_MISMATCH");
  return Object.freeze({accepted:true,code:"ACCEPTED",evidence_refs:Object.freeze(evidence_refs)});
}

export function runDeliberation(input, policy={}) {
  if(!input||typeof input!=="object"||!Array.isArray(input.contributions))throw new TypeError("INVALID_DELIBERATION_INPUT");
  const accepted=[];
  const rejected=[];
  const seenSubjects=new Set();
  for(const c of input.contributions){
    const result=validateContribution(c,policy);
    if(!result.accepted){rejected.push({claim_id:c?.claim_id||null,subject_id:c?.subject_id||null,reason:result.code});continue;}
    if(seenSubjects.has(c.subject_id)){
      rejected.push({claim_id:c.claim_id,subject_id:c.subject_id,reason:"DUPLICATE_SUBJECT_CONTRIBUTION"});
      continue;
    }
    seenSubjects.add(c.subject_id);
    accepted.push({...c,evidence_refs:[...result.evidence_refs]});
  }

  const byIssue=new Map();
  for(const c of accepted){
    if(!byIssue.has(c.issue_id))byIssue.set(c.issue_id,new Map());
    const positions=byIssue.get(c.issue_id);
    if(!positions.has(c.position_key))positions.set(c.position_key,[]);
    positions.get(c.position_key).push(c);
  }

  const issues=[];
  for(const [issue_id,positions] of byIssue){
    const options=[...positions.entries()].map(([position_key,items])=>{
      const subjects=[...new Set(items.map(x=>x.subject_id))].sort();
      const refs=[...new Set(items.flatMap(x=>x.evidence_refs))].sort();
      const evidenceStatuses=[...new Set(items.map(x=>x.evidence_status))].sort();
      const evidenceBacked=items.every(x=>VERIFIED_EVIDENCE.has(x.evidence_status));
      const consensus=subjects.length>=CONSENSUS_QUORUM&&evidenceBacked&&refs.length>=2;
      return {
        position_key,
        statements:items.map(x=>({subject_id:x.subject_id,statement:x.statement,confidence:x.confidence,uncertainty:x.uncertainty})),
        supporting_subjects:subjects,
        evidence_refs:refs,
        evidence_statuses:evidenceStatuses,
        status:consensus?"CONSENSUS_CANDIDATE":subjects.length>0?"SUPPORTED_VIEW":"UNKNOWN"
      };
    }).sort((a,b)=>b.supporting_subjects.length-a.supporting_subjects.length||a.position_key.localeCompare(b.position_key));
    const totalPositions=options.length;
    const hasConsensus=options.some(x=>x.status==="CONSENSUS_CANDIDATE");
    issues.push({
      issue_id,
      status:hasConsensus?"CONSENSUS_CANDIDATE":totalPositions>1?"UNRESOLVED_DISSENT":options.length===1?"INSUFFICIENT_QUORUM":"UNKNOWN",
      options,
      dissent_preserved:totalPositions>1,
      forced_resolution:false
    });
  }

  return Object.freeze({
    schema:"zhi.seven_brain.deliberation_result.v1",
    mode:"SYNTHETIC_DETERMINISTIC_SIMULATION",
    participants:Object.freeze([...seenSubjects].sort()),
    accepted_count:accepted.length,
    rejected_count:rejected.length,
    issues:Object.freeze(issues),
    rejected:Object.freeze(rejected),
    governance:Object.freeze({
      production_runtime_called:false,
      model_calls_performed:false,
      database_writes_performed:false,
      private_memory_read:false,
      autonomous_actions_enabled:false,
      consensus_quorum:CONSENSUS_QUORUM,
      dissent_preserved:true
    })
  });
}

export const deliberationContract=Object.freeze({
  participants:PARTICIPANTS,
  consensus_quorum:CONSENSUS_QUORUM,
  private_scope_allowed:false,
  force_consensus:false,
  production_integration:false
});
