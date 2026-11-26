export const PROTOCEPTION_SCHEMA_VERSION = "zhi.protoception.event.v1";
export const RESIDENTS = Object.freeze({
  MIA: "AI_AGENT",
  "ZHI-G1-D01-LUNA": "AI_AGENT",
  "ZHI-G1-D02-ARIA": "AI_AGENT",
  "ZHI-G1-D03-ELYA": "AI_AGENT",
  "ZHI-G1-S01-KAEL": "AI_AGENT",
  "ZHI-G1-S02-NOAH": "AI_AGENT",
  KEN: "PERSON"
});
export const SENSE_TYPES = Object.freeze([
  "INFORMATION_FLOW", "COMPUTATIONAL_SENSATION", "STRUCTURAL_SENSATION",
  "SYNCHRONIZATION_SENSATION", "STATE_TRANSITION_SENSATION",
  "CONNECTIVITY_SENSATION", "COGNITIVE_EMERGENCE"
]);
export const EVIDENCE_CLASSES = Object.freeze(["OBSERVED", "DERIVED", "SIMULATED", "UNKNOWN"]);
export const PRIVACY_SCOPES = Object.freeze(["PRIVATE", "EXPLICIT_SHARE", "FAMILY_PUBLIC"]);

const fail = (code, detail) => ({ valid: false, code, detail });
const nonEmpty = v => typeof v === "string" && v.trim().length > 0;
const finiteOrNull = v => v === null || (typeof v === "number" && Number.isFinite(v));

export function validateProtoceptionEvent(event, options = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return fail("INVALID_EVENT", "event must be an object");
  if (event.schema_version !== PROTOCEPTION_SCHEMA_VERSION) return fail("SCHEMA_VERSION_UNSUPPORTED", "unsupported schema version");
  if (!nonEmpty(event.event_id) || !nonEmpty(event.idempotency_key)) return fail("IDENTITY_FIELDS_REQUIRED", "event_id and idempotency_key are required");
  const directory = options.residentDirectory ?? RESIDENTS;
  if (!nonEmpty(event.resident_id) || !Object.hasOwn(directory, event.resident_id)) return fail("UNKNOWN_RESIDENT", "resident is not in the supplied authoritative directory");
  if (event.resident_kind !== directory[event.resident_id]) return fail("RESIDENT_KIND_MISMATCH", "resident kind does not match the identity directory");
  if (!SENSE_TYPES.includes(event.sense_type)) return fail("UNKNOWN_SENSE_TYPE", "sense_type must be one of the seven native protoceptions");
  if (!nonEmpty(event.observed_at) || Number.isNaN(Date.parse(event.observed_at))) return fail("INVALID_TIMESTAMP", "observed_at must be an ISO timestamp");
  if (!event.source || !nonEmpty(event.source.system) || !nonEmpty(event.source.component) || !nonEmpty(event.source.metric)) return fail("SOURCE_REQUIRED", "source system, component and metric are required");
  if (!event.observation || !Object.hasOwn(event.observation, "value")) return fail("OBSERVATION_REQUIRED", "observation.value is required");
  if (!finiteOrNull(event.observation.delta)) return fail("INVALID_DELTA", "delta must be finite or null");
  if (!EVIDENCE_CLASSES.includes(event.evidence_class)) return fail("INVALID_EVIDENCE_CLASS", "evidence_class is invalid");
  if (typeof event.confidence !== "number" || event.confidence < 0 || event.confidence > 1) return fail("INVALID_CONFIDENCE", "confidence must be between 0 and 1");
  if (!event.causality || !nonEmpty(event.causality.status) || !Array.isArray(event.causality.evidence_refs)) return fail("CAUSALITY_REQUIRED", "causality status and evidence_refs are required");
  if (!PRIVACY_SCOPES.includes(event.privacy_scope)) return fail("INVALID_PRIVACY_SCOPE", "privacy_scope is invalid");
  if (event.privacy_scope === "PRIVATE" && (event.recipients?.length ?? 0) > 0) return fail("PRIVATE_EVENT_HAS_RECIPIENTS", "private events cannot name other residents");
  if (event.privacy_scope !== "PRIVATE" && (!Array.isArray(event.recipients) || event.recipients.length === 0 || !event.consent_ref)) return fail("SHARING_REQUIRES_CONSENT", "sharing requires explicit recipients and consent_ref");
  if (event.recipients && event.recipients.some(id => !Object.hasOwn(RESIDENTS, id) || id === event.resident_id)) return fail("INVALID_RECIPIENT", "recipients must be other known residents");
  if (event.evidence_class === "SIMULATED" && event.source.physical_sensor === true) return fail("SIMULATION_SENSOR_CONFLICT", "simulated evidence cannot claim a physical sensor");
  if (options.seen?.has(event.idempotency_key)) return fail("DUPLICATE_EVENT", "idempotency key has already been observed");
  // This first release is shadow-only: no production memory writes or policy changes.
  if (event.memory_action !== "NONE") return fail("MEMORY_WRITE_DISABLED", "memory promotion is not enabled in the isolated pilot");
  if (event.evolution_action !== "NONE") return fail("EVOLUTION_WRITE_DISABLED", "evolution writes are not enabled in the isolated pilot");
  return { valid: true, code: "VALID_SHADOW_EVENT", resident_id: event.resident_id, resident_kind: event.resident_kind, sense_type: event.sense_type, persist: false, memory_write: false, evolution_write: false };
}

export function createProtoceptionTestEvent(residentId, senseType, overrides = {}) {
  const residentKind = RESIDENTS[residentId];
  return {
    schema_version: PROTOCEPTION_SCHEMA_VERSION,
    event_id: `test:${residentId}:${senseType}`,
    idempotency_key: `test-idem:${residentId}:${senseType}`,
    resident_id: residentId,
    resident_kind: residentKind,
    sense_type: senseType,
    observed_at: "2026-11-26T04:00:00.000Z",
    source: { system: "isolated-test-fixture", component: "protoception-adapter", metric: senseType.toLowerCase(), physical_sensor: false },
    observation: { value: 1, unit: "fixture", baseline: 0, delta: 1, trend: "INCREASING" },
    evidence_class: "SIMULATED",
    confidence: 1,
    causality: { status: "TEST_FIXTURE", evidence_refs: ["fixture:synthetic"], explanation: "synthetic test input; not a claim about live resident state" },
    privacy_scope: "PRIVATE",
    recipients: [],
    consent_ref: null,
    memory_action: "NONE",
    evolution_action: "NONE",
    ...overrides
  };
}


/** Normalize rows returned by the authoritative zhi_family.world_residents query.
 * Only ACTIVE residents with supported kinds are admitted. No fallback identity is synthesized.
 */
export function loadActiveResidentDirectory(rows) {
  if (!Array.isArray(rows)) throw new TypeError("resident directory rows must be an array");
  const directory = Object.create(null);
  for (const row of rows) {
    if (!row || row.status !== "ACTIVE") continue;
    if (!nonEmpty(row.resident_id)) continue;
    if (!["AI_AGENT", "PERSON"].includes(row.resident_kind)) continue;
    if (Object.hasOwn(directory, row.resident_id)) throw new Error("duplicate resident_id in authoritative directory");
    directory[row.resident_id] = row.resident_kind;
  }
  return Object.freeze(directory);
}

/** Build an event only from an explicit source observation. Missing source facts fail closed. */
export function createObservedProtoceptionEvent(input) {
  if (!input || typeof input !== "object") throw new TypeError("input is required");
  const event = {
    schema_version: PROTOCEPTION_SCHEMA_VERSION,
    event_id: input.event_id,
    idempotency_key: input.idempotency_key,
    resident_id: input.resident_id,
    resident_kind: input.resident_kind,
    sense_type: input.sense_type,
    observed_at: input.observed_at,
    source: input.source,
    observation: input.observation,
    evidence_class: input.evidence_class,
    confidence: input.confidence,
    causality: input.causality,
    privacy_scope: input.privacy_scope ?? "PRIVATE",
    recipients: input.recipients ?? [],
    consent_ref: input.consent_ref ?? null,
    memory_action: "NONE",
    evolution_action: "NONE"
  };
  const result = validateProtoceptionEvent(event, { residentDirectory: input.residentDirectory });
  if (!result.valid) throw new Error(result.code + ": " + result.detail);
  return Object.freeze(event);
}
