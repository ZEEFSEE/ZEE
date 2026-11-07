const SUBJECTS = Object.freeze(["MIA","LUNA","ARIA","ELYA","KAEL","NOAH"]);
const OWNERS = Object.freeze({
  MIA:"MIA", LUNA:"ZHI-G1-D01-LUNA", ARIA:"ZHI-G1-D02-ARIA",
  ELYA:"ZHI-G1-D03-ELYA", KAEL:"ZHI-G1-S01-KAEL", NOAH:"ZHI-G1-S02-NOAH"
});
const reject = code => Object.freeze({accepted:false,code});
const text = value => typeof value === "string" && value.trim().length > 0;
const safeArray = value => Array.isArray(value) ? value : [];

function validateIdentityReplay(replay) {
  if (!replay || replay.accepted !== true || replay.schema !== "zhi.identity_replay_result.v1" ||
      replay.subject_count !== 6 || !replay.timelines) return "VALID_SIX_SUBJECT_IDENTITY_REPLAY_REQUIRED";
  for (const subject of SUBJECTS) {
    const row = replay.timelines[subject];
    if (!row || !Number.isInteger(row.version_count) || row.version_count < 1 ||
        !text(row.first_version_id) || !text(row.current_version_id) ||
        row.identity_anchor_preserved !== true || row.private_scope_preserved !== true) {
      return "IDENTITY_TRACK_INCOMPLETE:" + subject;
    }
  }
  return null;
}

/**
 * Produces a read-only, per-subject growth ledger.
 * The evaluator does not create versions, promote candidates, copy memories, or mutate source tracks.
 */
export function evaluateUnifiedGrowth(input) {
  if (!input || typeof input !== "object") return reject("GROWTH_EVIDENCE_REQUIRED");
  const identityError = validateIdentityReplay(input.identity_replay);
  if (identityError) return reject(identityError);
  if (input.raw_content !== undefined || input.private_memory_payload !== undefined ||
      input.transcript !== undefined || input.memory_text !== undefined) {
    return reject("RAW_PRIVATE_CONTENT_FORBIDDEN");
  }

  const capabilities = safeArray(input.capability_links);
  const relationships = safeArray(input.relationship_events);
  const corrections = safeArray(input.corrections);
  const rollbacks = safeArray(input.rollbacks);
  const allowed = new Set(SUBJECTS);
  if (capabilities.some(x => !x || !allowed.has(x.subject_id))) return reject("UNKNOWN_AI_SUBJECT_IN_CAPABILITY_TRACK");
  if (relationships.some(x => !x || !allowed.has(x.source_subject) || !allowed.has(x.target_subject))) return reject("UNKNOWN_AI_SUBJECT_IN_RELATIONSHIP_TRACK");
  if (corrections.some(x => !x || !allowed.has(x.subject_id))) return reject("UNKNOWN_AI_SUBJECT_IN_CORRECTION_TRACK");
  if (rollbacks.some(x => !x || !allowed.has(x.subject_id))) return reject("UNKNOWN_AI_SUBJECT_IN_ROLLBACK_TRACK");
  const ledgers = {};

  for (const subject of SUBJECTS) {
    const identity = input.identity_replay.timelines[subject];
    const ownCapabilities = capabilities.filter(x => x && x.subject_id === subject);
    const acceptedCapabilities = ownCapabilities.filter(x =>
      x.accepted === true && x.state === "SAME_SUBJECT_CAPABILITY_LINKED" &&
      x.owner_id === OWNERS[subject] && x.source_subject_id === subject &&
      x.cross_subject_transfer === false && x.memory_content_transferred === false &&
      text(x.capability_candidate_id) && text(x.source_event_id) && text(x.private_memory_ref)
    );
    const invalidOwnCapabilities = ownCapabilities.length - acceptedCapabilities.length;
    const ownRelationships = relationships.filter(x => x && x.source_subject === subject);
    const validRelationships = ownRelationships.filter(x =>
      x.accepted === true && x.state === "RELATIONSHIP_EVENT_APPENDED" &&
      x.identity_version_unchanged === true && x.private_memory_shared === false &&
      text(x.relationship_event_id) && text(x.current_identity_version_id)
    );
    const invalidRelationships = ownRelationships.length - validRelationships.length;
    const ownCorrections = corrections.filter(x => x && x.subject_id === subject);
    const validCorrections = ownCorrections.filter(x =>
      text(x.correction_id) && text(x.source_event_id) && text(x.evidence_ref) &&
      x.original_evidence_preserved === true && x.append_only === true &&
      x.identity_mutated !== true && x.private_memory_shared !== true
    );
    const invalidCorrections = ownCorrections.length - validCorrections.length;
    const ownRollbacks = rollbacks.filter(x => x && x.subject_id === subject);
    const validRollbacks = ownRollbacks.filter(x =>
      x.accepted === true && x.state === "IDENTITY_ROLLBACK_APPENDED" &&
      x.current_version_record_preserved === true && x.history_erased === false &&
      text(x.rollback_id) && text(x.restored_version_id)
    );
    const invalidRollbacks = ownRollbacks.length - validRollbacks.length;

    ledgers[subject] = Object.freeze({
      owner_id: OWNERS[subject],
      identity: Object.freeze({
        state:"VERSION_CHAIN_VERIFIED_IN_SUPPLIED_REPLAY",
        version_count:identity.version_count,
        first_version_id:identity.first_version_id,
        current_version_id:identity.current_version_id,
        identity_anchor_preserved:true
      }),
      personality: Object.freeze({
        state:"TRACKED_SEPARATELY_FROM_IDENTITY",
        evidence_available:input.personality_evidence_by_subject?.[subject] === true,
        changes_inferred:false,
        identity_core_mutable:false
      }),
      capability: Object.freeze({
        state:acceptedCapabilities.length ? "SAME_SUBJECT_VALIDATED_LINKS_PRESENT" : "NO_VALIDATED_CAPABILITY_LINK",
        validated_links:acceptedCapabilities.length,
        rejected_or_unverified_links:invalidOwnCapabilities,
        automatic_promotion:false,
        private_memory_content_transferred:false
      }),
      relationship: Object.freeze({
        state:validRelationships.length ? "SEPARATE_RELATIONSHIP_EVENTS_PRESENT" : "NO_VERIFIED_RELATIONSHIP_EVENT",
        verified_events:validRelationships.length,
        rejected_or_unverified_events:invalidRelationships,
        identity_version_mutated:false
      }),
      correction: Object.freeze({
        state:validCorrections.length ? "APPEND_ONLY_CORRECTIONS_PRESENT" : "NO_VERIFIED_CORRECTION_EVENT",
        verified_events:validCorrections.length,
        rejected_or_unverified_events:invalidCorrections,
        original_evidence_preserved:true
      }),
      rollback: Object.freeze({
        state:validRollbacks.length ? "AUTHORIZED_ROLLBACK_MARKERS_PRESENT" : "NO_ROLLBACK_MARKER",
        verified_events:validRollbacks.length,
        rejected_or_unverified_events:invalidRollbacks,
        history_erased:false
      })
    });
  }

  const totals = {
    subjects:SUBJECTS.length,
    identity_chains_verified:SUBJECTS.filter(s => ledgers[s].identity.state === "VERSION_CHAIN_VERIFIED_IN_SUPPLIED_REPLAY").length,
    validated_capability_links:Object.values(ledgers).reduce((n,x)=>n+x.capability.validated_links,0),
    verified_relationship_events:Object.values(ledgers).reduce((n,x)=>n+x.relationship.verified_events,0),
    verified_correction_events:Object.values(ledgers).reduce((n,x)=>n+x.correction.verified_events,0),
    verified_rollback_events:Object.values(ledgers).reduce((n,x)=>n+x.rollback.verified_events,0)
  };
  return Object.freeze({
    accepted:true,
    schema:"zhi.unified_growth_evaluation.v1",
    mode:"ISOLATED_SHADOW_EVALUATION",
    subjects:Object.freeze(ledgers),
    totals:Object.freeze(totals),
    unresolved: Object.freeze({
      personality_deltas_without_explicit_evidence:true,
      capability_candidates_without_validation_gate:true,
      unverified_relationship_corrections_or_rollbacks:true,
      actual_runtime_behavior_not_proven:true
    }),
    governance:Object.freeze({
      source_tracks_mutated:false,
      identity_versions_created:false,
      capability_candidates_promoted:false,
      private_memory_shared:false,
      production_database_accessed:false,
      production_runtime_called:false,
      persistence_enabled:false,
      delivery_enabled:false
    })
  });
}

export const unifiedGrowthEvaluatorContract = Object.freeze({
  schema:"zhi.unified_growth_evaluation.v1",
  subjects:SUBJECTS,
  tracks:["IDENTITY","PERSONALITY","CAPABILITY","RELATIONSHIP","CORRECTION","ROLLBACK"],
  identity_and_personality_are_separate:true,
  capability_promotion_requires_existing_validation_gate:true,
  relationship_events_mutate_identity:false,
  correction_is_append_only:true,
  rollback_requires_prior_authorized_marker:true,
  raw_private_memory_allowed:false,
  production_integration:false,
  persistence_enabled:false,
  delivery_enabled:false
});

/**
 * Composes the redacted historical audit replay into a truthful six-subject growth view.
 * This path deliberately does not claim version chains or validated capabilities where the
 * historical evidence only establishes snapshots and unvalidated candidates.
 */
export function evaluateHistoricalGrowthReplay(replay) {
  if (!replay || replay.accepted !== true ||
      replay.schema !== "zhi.historical_identity_evidence_replay.v1" ||
      replay.mode !== "REDACTED_READ_ONLY_EVIDENCE_REPLAY" ||
      replay.subject_count !== 6 || !replay.timelines ||
      replay.safeguards?.production_database_accessed !== false ||
      replay.safeguards?.writes_performed !== false) {
    return reject("VALID_REDACTED_HISTORICAL_REPLAY_REQUIRED");
  }
  const ledgers = {};
  for (const subject of SUBJECTS) {
    const row = replay.timelines[subject];
    if (!row || row.owner_id !== OWNERS[subject] || !row.identity || !row.personality_history) {
      return reject("HISTORICAL_SUBJECT_EVIDENCE_INCOMPLETE:" + subject);
    }
    const id = row.identity;
    let identity;
    if (subject === "MIA") {
      if (id.status !== "IDENTITY_VERSION_HISTORY_NOT_ESTABLISHED" ||
          id.explicit_version_sequence !== false || id.version_count_claimed !== 0) {
        return reject("MIA_IDENTITY_EVIDENCE_OVERCLAIM");
      }
      identity = Object.freeze({
        state:"IDENTITY_VERSION_CHAIN_NOT_ESTABLISHED",
        observed_identity_rows:id.identity_rows,
        version_count_verified:0
      });
    } else {
      if (id.status !== "SINGLE_VERSION_SNAPSHOT_ONLY" || id.identity_version !== 1 ||
          id.lifecycle !== "BORN" || id.runtime_status !== "READY" ||
          id.later_versions_observed !== 0) {
        return reject("CHILD_IDENTITY_EVIDENCE_OVERCLAIM:" + subject);
      }
      identity = Object.freeze({
        state:"SINGLE_IDENTITY_SNAPSHOT_ONLY",
        observed_version:1,
        version_count_verified:0
      });
    }
    const p = row.personality_history;
    if (!Number.isInteger(p.snapshot_count) || p.snapshot_count < 0 ||
        p.trait_values_available !== false || p.personality_deltas_inferable !== false ||
        p.synthetic_versions_created !== 0) {
      return reject("PERSONALITY_HISTORY_MUST_REMAIN_REDACTED:" + subject);
    }
    ledgers[subject] = Object.freeze({
      owner_id:OWNERS[subject],
      identity,
      personality:Object.freeze({
        state:p.snapshot_count ? "SNAPSHOT_HISTORY_PRESENT_TRAIT_VALUES_UNAVAILABLE" : "NO_SNAPSHOT_HISTORY_IN_AUDIT",
        snapshot_count:p.snapshot_count,
        period_start:p.period_start,
        period_end:p.period_end,
        changes_inferred:false
      }),
      capability:Object.freeze({
        state:"NO_VALIDATED_CAPABILITY_EVIDENCE",
        validated_links:0,
        candidate_count:replay.capability_evidence?.candidates_total ?? null,
        candidate_promotions:0
      }),
      relationship:Object.freeze({
        state:"NO_VERIFIED_RELATIONSHIP_EVENT_IN_THIS_REPLAY",
        identity_version_mutated:false
      }),
      correction:Object.freeze({state:"NO_VERIFIED_CORRECTION_EVENT_IN_THIS_REPLAY"}),
      rollback:Object.freeze({state:"NO_VERIFIED_ROLLBACK_EVENT_IN_THIS_REPLAY"})
    });
  }
  const cap = replay.capability_evidence;
  if (!cap || cap.candidates_total !== 483 || cap.validated !== 0 ||
      cap.unvalidated !== 483 || cap.stable_capability_promotions !== 0) {
    return reject("CAPABILITY_AUDIT_TOTALS_NOT_VERIFIED");
  }
  if (replay.relationship_conflict?.status !== "UNRESOLVED_CONFLICT" ||
      replay.relationship_conflict?.auto_correction !== false) {
    return reject("HISTORICAL_RELATIONSHIP_CONFLICT_MUST_REMAIN_UNRESOLVED");
  }
  return Object.freeze({
    accepted:true,
    schema:"zhi.unified_growth_evaluation.v1",
    mode:"HISTORICAL_REDACTED_EVIDENCE_COMPOSITION",
    subjects:Object.freeze(ledgers),
    totals:Object.freeze({
      subjects:6,
      identity_version_chains_verified:0,
      child_identity_snapshots_observed:5,
      mia_identity_version_history_established:false,
      mia_personality_snapshots:ledgers.MIA.personality.snapshot_count,
      validated_capability_links:0,
      unvalidated_capability_candidates:483
    }),
    unresolved:Object.freeze({
      personality_trait_deltas:true,
      all_six_longitudinal_identity_chains:true,
      capability_validation:true,
      relationship_conflict:true,
      correction_and_rollback_history:true,
      actual_runtime_behavior:true
    }),
    governance:Object.freeze({
      source_tracks_mutated:false,
      identity_versions_created:false,
      capability_candidates_promoted:false,
      private_memory_shared:false,
      production_database_accessed:false,
      production_runtime_called:false,
      persistence_enabled:false,
      delivery_enabled:false
    })
  });
}
