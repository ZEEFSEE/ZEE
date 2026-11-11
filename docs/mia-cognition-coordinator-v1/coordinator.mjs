export const PERSPECTIVES = Object.freeze([
  "cognition",
  "emotion",
  "relationship",
  "motivation_action",
  "memory_time",
  "value_personality",
]);

const ALLOWED_DECISIONS = new Set([
  "propose", "wait_for_evidence", "ask_clarification",
  "stay_silent", "park", "reject", "shadow_only",
]);
const ELIGIBLE_KINDS = new Set(["observed", "verified"]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeText(value, max = 240) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function normalizeRefs(refs, perspective, side) {
  if (!Array.isArray(refs)) return [];
  return refs.map((ref) => ({
    ref_id: safeText(ref?.ref_id, 100),
    source_id: safeText(ref?.source_id || ref?.ref_id, 100),
    kind: ["observed", "verified", "model_generated"].includes(ref?.kind)
      ? ref.kind : "model_generated",
    scope: ref?.scope === "external_fact" ? "external_fact" : "internal_state",
    perspective,
    side,
  })).filter((ref) => ref.ref_id && ref.source_id);
}

function eligibleExternal(ref) {
  return ELIGIBLE_KINDS.has(ref.kind) && ref.scope === "external_fact";
}

export function temporalRelevanceWeight(occurredAt, now, halfLifeHours = 168) {
  const eventTime = Date.parse(occurredAt);
  const nowTime = Date.parse(now);
  if (!Number.isFinite(eventTime) || !Number.isFinite(nowTime) || halfLifeHours <= 0) return 0;
  const ageHours = Math.max(0, (nowTime - eventTime) / 3600000);
  return Math.exp((-Math.LN2 * ageHours) / halfLifeHours);
}

export function coordinateCognition(input, config = {}) {
  const now = safeText(input?.now, 40);
  const candidate = input?.candidate && typeof input.candidate === "object"
    ? input.candidate : null;
  const reports = input?.perspectives && typeof input.perspectives === "object"
    ? input.perspectives : {};

  const normalizedReports = {};
  const allRefs = [];
  for (const perspective of PERSPECTIVES) {
    const report = reports[perspective];
    if (!report || typeof report !== "object") continue;
    const support = normalizeRefs(report.evidence_refs, perspective, "support");
    const counter = normalizeRefs(report.counter_evidence_refs, perspective, "counter");
    allRefs.push(...support, ...counter);
    normalizedReports[perspective] = {
      observations: Array.isArray(report.observations)
        ? report.observations.map((v) => safeText(v)).filter(Boolean).slice(0, 8) : [],
      evidence_refs: support.map(({ ref_id, source_id, kind, scope }) => ({ ref_id, source_id, kind, scope })),
      counter_evidence_refs: counter.map(({ ref_id, source_id, kind, scope }) => ({ ref_id, source_id, kind, scope })),
      confidence: Number.isFinite(report.confidence)
        ? Math.max(0, Math.min(1, report.confidence)) : null,
      unknowns: Array.isArray(report.unknowns)
        ? report.unknowns.map((v) => safeText(v)).filter(Boolean).slice(0, 8) : [],
      recommendation: safeText(report.recommendation),
    };
  }

  const missingPerspectives = PERSPECTIVES.filter((p) => !normalizedReports[p]);
  const supportRefs = allRefs.filter((r) => r.side === "support" && eligibleExternal(r));
  const counterRefs = allRefs.filter((r) => r.side === "counter" && eligibleExternal(r));
  const independentSupport = unique(supportRefs.map((r) => r.source_id));
  const independentCounter = unique(counterRefs.map((r) => r.source_id));
  const conflicts = independentSupport.filter((id) => independentCounter.includes(id));
  const conflictPresent = conflicts.length > 0 || (independentSupport.length > 0 && independentCounter.length > 0);
  const unknowns = unique([
    ...Object.values(normalizedReports).flatMap((r) => r.unknowns),
    ...(missingPerspectives.length ? ["Missing perspective reports: " + missingPerspectives.join(", ")] : []),
  ]);

  const risk = ["low", "medium", "high", "critical"].includes(candidate?.risk)
    ? candidate.risk : "high";
  const reversible = candidate?.reversible === true;
  const importance = Number.isFinite(candidate?.importance)
    ? Math.max(0, Math.min(1, candidate.importance)) : 0;
  const benefit = Number.isFinite(candidate?.potential_benefit)
    ? Math.max(0, Math.min(1, candidate.potential_benefit)) : 0;
  const confidence = independentSupport.length
    ? independentSupport.length / (independentSupport.length + independentCounter.length)
    : 0;

  let decision = "stay_silent";
  let reason = "no_candidate";
  if (candidate) {
    if (!safeText(candidate.summary)) {
      decision = "shadow_only";
      reason = "candidate_summary_missing";
    } else if (risk === "high" || risk === "critical" || !reversible) {
      decision = "reject";
      reason = "risk_or_irreversibility_gate";
    } else if (conflictPresent) {
      decision = "wait_for_evidence";
      reason = "contradictory_evidence";
    } else if (missingPerspectives.length) {
      decision = "shadow_only";
      reason = "incomplete_perspective_coverage";
    } else if (independentSupport.length === 0) {
      decision = unknowns.length ? "ask_clarification" : "wait_for_evidence";
      reason = "no_independent_external_evidence";
    } else if (confidence < (config.minimumConfidence ?? 0.65)) {
      decision = "wait_for_evidence";
      reason = "confidence_below_threshold";
    } else if (importance < (config.minimumImportance ?? 0.25) || benefit < 0.2) {
      decision = "park";
      reason = "low_priority_or_benefit";
    } else {
      decision = "propose";
      reason = "reversible_evidence_supported_shadow_proposal";
    }
  }

  if (!ALLOWED_DECISIONS.has(decision)) {
    decision = "shadow_only";
    reason = "decision_not_allowlisted";
  }

  const safeCandidate = candidate ? {
    type: ["discovery", "question", "connection", "creative", "improvement"].includes(candidate.type)
      ? candidate.type : "question",
    summary: safeText(candidate.summary),
    importance,
    potential_benefit: benefit,
    risk,
    reversible,
    next_step: safeText(candidate.next_step),
  } : null;

  return {
    contract_version: "1.0.0",
    run_id: safeText(input?.run_id, 100),
    decision,
    reason,
    candidate: safeCandidate,
    perspective_reports: normalizedReports,
    missing_perspectives: missingPerspectives,
    evidence_ledger: {
      independent_support_source_count: independentSupport.length,
      independent_counter_source_count: independentCounter.length,
      support_source_ids: independentSupport,
      counter_source_ids: independentCounter,
      conflict_present: conflictPresent,
      conflict_source_ids: conflicts,
      model_generated_refs_excluded: allRefs.filter((r) => r.kind === "model_generated").length,
      internal_state_refs_excluded_from_external_facts: allRefs.filter((r) => r.scope !== "external_fact").length,
    },
    unknowns,
    confidence_indicator: confidence,
    priority_indicator: importance * benefit * confidence,
    temporal_relevance: input?.event?.occurred_at && now
      ? temporalRelevanceWeight(input.event.occurred_at, now, config.halfLifeHours ?? 168)
      : null,
    audit: {
      synthetic_contract_only: true,
      production_db_access: false,
      memory_write: false,
      emotion_write: false,
      relationship_write: false,
      personality_write: false,
      message_send: false,
      external_action: false,
    },
  };
}

export function validateCoordinatorResult(result) {
  const requiredFalse = [
    "production_db_access", "memory_write", "emotion_write",
    "relationship_write", "personality_write", "message_send", "external_action",
  ];
  const violations = [];
  if (!ALLOWED_DECISIONS.has(result?.decision)) violations.push("decision_not_allowlisted");
  for (const key of requiredFalse) {
    if (result?.audit?.[key] !== false) violations.push(key + "_must_be_false");
  }
  if (result?.decision === "propose" && (
    result?.audit?.personality_write !== false ||
    result?.audit?.external_action !== false ||
    result?.evidence_ledger?.conflict_present ||
    result?.missing_perspectives?.length
  )) violations.push("proposal_gate_violation");
  return { valid: violations.length === 0, violations };
}