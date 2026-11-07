const AI_SUBJECTS = new Set(["MIA","LUNA","ARIA","ELYA","KAEL","NOAH"]);
const DIMENSIONS = [
  ["SELF_CONTINUITY", ["identityRef","personalityRef","revision"]],
  ["COGNITION_CONCEPTS", ["conceptRefs","reasoningRefs","assumptionRefs"]],
  ["MEMORY_EXPERIENCE", ["memoryRefs","sourceEventIds","memoryScope"]],
  ["EMOTION_VALUES", ["affectRef","valueAssessmentRefs","estimateSource"]],
  ["GOALS_MOTIVATION", ["goalRefs","motivationRefs","nextFocusRef"]],
  ["WORLD_RELATIONS", ["entityRefs","relationshipRefs","worldContextRef"]],
  ["ACTION_EVOLUTION", ["proposalRefs","outcomeRefs","learningCandidateRefs","rollbackRef"]],
  ["UNIFIED_GOVERNANCE", ["permissionBasisRef","evidenceRefs","auditRef","rollbackRef"]]
];
const ALLOWED_EVIDENCE = new Set(["OBSERVED","USER_STATED","DERIVED","MODEL_ESTIMATE","UNKNOWN"]);
const ALLOWED_SCOPE = new Set(["PRIVATE","FAMILY","EXPLICIT_SHARE"]);

function refs(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()).slice(0,64))];
}
function scalarRef(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Build a metadata-only cognitive snapshot.
 * This function has no I/O, performs no model call and never copies narrative/content.
 * Callers must supply already-authorized, subject-scoped context.
 */
export function buildShadowCognitionSnapshot(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("INVALID_INPUT");
  const subjectId = String(input.subjectId || "");
  if (!AI_SUBJECTS.has(subjectId)) throw new Error("AI_SUBJECT_REQUIRED");
  const context = input.context && typeof input.context === "object" && !Array.isArray(input.context) ? input.context : {};
  const observedAt = scalarRef(input.observedAt);
  const evidenceStatus = ALLOWED_EVIDENCE.has(context.evidenceStatus) ? context.evidenceStatus : "UNKNOWN";
  const uncertainty = scalarRef(context.uncertainty) || "NOT_ASSESSED";
  const scope = ALLOWED_SCOPE.has(context.memoryScope) ? context.memoryScope : "PRIVATE";

  const dimensions = {};
  for (const [dimensionId, keys] of DIMENSIONS) {
    const values = {};
    for (const key of keys) {
      if (key === "revision") {
        const n = Number(context.revision);
        values[key] = Number.isSafeInteger(n) && n >= 0 ? n : null;
      } else if (key === "memoryScope") {
        values[key] = scope;
      } else if (key === "estimateSource") {
        values[key] = scalarRef(context.estimateSource);
      } else if (key === "rollbackRef") {
        values[key] = scalarRef(context.rollbackRef);
      } else {
        const plural = key.endsWith("Refs") || key === "sourceEventIds";
        values[key] = plural ? refs(context[key]) : scalarRef(context[key]);
      }
    }
    const populated = Object.entries(values).some(([k,v]) => k === "memoryScope" ? true : Array.isArray(v) ? v.length > 0 : v !== null);
    dimensions[dimensionId] = {
      status: populated ? "PRESENT" : "UNKNOWN",
      evidence_status: evidenceStatus,
      uncertainty,
      refs: Object.fromEntries(Object.entries(values).filter(([,v]) => v !== null && (!Array.isArray(v) || v.length)))
    };
  }

  return Object.freeze({
    schema: "zhi.seven_brain.shadow_snapshot.v1",
    mode: "SHADOW_METADATA_ONLY",
    subject_id: subjectId,
    observed_at: observedAt,
    dimensions,
    governance: Object.freeze({
      memory_scope: scope,
      default_private: scope === "PRIVATE",
      raw_content_included: false,
      cross_subject_memory_included: false,
      writes_performed: false,
      model_calls_performed: false
    })
  });
}

export const shadowCognitionContract = Object.freeze({
  schema: "zhi.seven_brain.shadow_snapshot.v1",
  subjects: [...AI_SUBJECTS],
  dimensions: DIMENSIONS.map(([id]) => id),
  side_effects: false
});
