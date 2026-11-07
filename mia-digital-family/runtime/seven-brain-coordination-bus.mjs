const SUBJECTS = new Map([
  ["MIA","AI_AGENT"],["LUNA","AI_AGENT"],["ARIA","AI_AGENT"],["ELYA","AI_AGENT"],
  ["KAEL","AI_AGENT"],["NOAH","AI_AGENT"],["KEN","HUMAN_PARTICIPANT"]
]);
const SCOPES = new Set(["PRIVATE","FAMILY","EXPLICIT_SHARE"]);
const TYPES = new Set(["PROPOSAL","RESPONSE","DISSENT","RESOLUTION","KNOWLEDGE_OFFER","KNOWLEDGE_ACCEPTED","REVOCATION"]);
const EVIDENCE = new Set(["OBSERVED","USER_STATED","DERIVED","MODEL_ESTIMATE","UNKNOWN"]);
const FORBIDDEN_CONTENT_KEYS = new Set(["content","narrative","raw_memory","private_memory","memory_text","message_body","transcript"]);

function nonempty(value){return typeof value==="string"&&value.trim().length>0;}
function uniqueSubjects(value){
  return Array.isArray(value)&&value.length>0&&new Set(value).size===value.length&&value.every(x=>SUBJECTS.has(x));
}

/**
 * Pure authorization and shape validator for a synthetic coordination envelope.
 * No delivery, persistence, model call, or mutation occurs here.
 */
export function validateCoordinationEnvelope(envelope, policy={}) {
  const deny = (code) => Object.freeze({allowed:false,code,deliver_to:[]});
  if(!envelope||typeof envelope!=="object"||Array.isArray(envelope))return deny("INVALID_ENVELOPE");
  if(!nonempty(envelope.event_id)||!nonempty(envelope.idempotency_key)||!nonempty(envelope.event_type))return deny("MISSING_EVENT_ID_OR_IDEMPOTENCY");
  if(!TYPES.has(envelope.event_type))return deny("UNSUPPORTED_EVENT_TYPE");
  if(!SUBJECTS.has(envelope.source_subject))return deny("UNKNOWN_SOURCE_SUBJECT");
  if(!uniqueSubjects(envelope.recipient_subjects))return deny("INVALID_RECIPIENTS");
  if(!SCOPES.has(envelope.scope))return deny("INVALID_SCOPE");
  if(!Array.isArray(envelope.evidence_refs)||envelope.evidence_refs.length===0||!envelope.evidence_refs.every(nonempty))return deny("EVIDENCE_REQUIRED");
  if(!EVIDENCE.has(envelope.evidence_status))return deny("INVALID_EVIDENCE_STATUS");
  if(typeof envelope.confidence!=="number"||!Number.isFinite(envelope.confidence)||envelope.confidence<0||envelope.confidence>1)return deny("INVALID_CONFIDENCE");
  if(!nonempty(envelope.uncertainty))return deny("UNCERTAINTY_REQUIRED");
  if(!nonempty(envelope.policy_basis))return deny("POLICY_BASIS_REQUIRED");
  if(!nonempty(envelope.payload_ref))return deny("PAYLOAD_REFERENCE_REQUIRED");
  const payload=envelope.payload_metadata;
  if(payload!==undefined&&(!payload||typeof payload!=="object"||Array.isArray(payload)))return deny("INVALID_PAYLOAD_METADATA");
  if(payload&&Object.keys(payload).some(k=>FORBIDDEN_CONTENT_KEYS.has(k.toLowerCase())))return deny("RAW_CONTENT_NOT_ALLOWED");
  if(envelope.scope==="PRIVATE"&&envelope.recipient_subjects.some(x=>x!==envelope.source_subject))return deny("PRIVATE_SCOPE_CANNOT_CROSS_SUBJECTS");
  if(envelope.scope==="FAMILY"){
    if(policy.family_source_verified!==true||envelope.family_owner!=="ZHI-G1"||envelope.visibility!=="FAMILY")return deny("FAMILY_SOURCE_NOT_VERIFIED");
  }
  if(envelope.scope==="EXPLICIT_SHARE"){
    if(!nonempty(envelope.consent_ref)||!Array.isArray(envelope.approved_recipients))return deny("EXPLICIT_CONSENT_REQUIRED");
    const approved=new Set(envelope.approved_recipients);
    if(envelope.recipient_subjects.some(x=>!approved.has(x)))return deny("RECIPIENT_NOT_CONSENTED");
  }
  if(policy.revoked===true)return deny("POLICY_REVOKED");
  if(policy.already_seen_idempotency_key===true)return deny("DUPLICATE_EVENT");
  return Object.freeze({
    allowed:true,
    code:"AUTHORIZED_FOR_SYNTHETIC_DELIVERY",
    deliver_to:Object.freeze([...envelope.recipient_subjects]),
    payload_ref:envelope.payload_ref,
    audit_required:true,
    persistence_enabled:false,
    delivery_enabled:false
  });
}

export const coordinationBusContract=Object.freeze({
  schema:"zhi.seven_brain.coordination_envelope.v1",
  subjects:[...SUBJECTS.keys()],
  event_types:[...TYPES],
  scopes:[...SCOPES],
  default_scope:"PRIVATE",
  raw_payloads_allowed:false,
  delivery_enabled:false,
  persistence_enabled:false
});
