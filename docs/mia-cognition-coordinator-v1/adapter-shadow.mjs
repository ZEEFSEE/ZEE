import { createHmac } from "node:crypto";

export const ADAPTER_TABLES = Object.freeze({
  mia_life_events: Object.freeze(["id", "event_type", "occurred_at", "source_table", "source_record_id", "created_at"]),
  mia_exploration_runs: Object.freeze(["id", "status", "source_type", "started_at", "completed_at"]),
  mia_emotion_events: Object.freeze(["id", "emotion_type", "intensity", "valence", "occurred_at"]),
  mia_relationship_context: Object.freeze(["id", "relationship_type", "confidence", "observed_at"]),
  mia_forest_autonomy_runs: Object.freeze(["id", "status", "created_at", "completed_at"]),
  mia_memories: Object.freeze(["id", "memory_type", "importance", "occurred_at", "created_at"]),
});

const ENUMS = Object.freeze({
  event_type: new Set(["observation", "decision", "activity", "encounter", "reflection", "unknown"]),
  status: new Set(["pending", "running", "completed", "failed", "skipped", "unknown"]),
  source_type: new Set(["virtual_simulation", "connected_world_data", "unknown"]),
  emotion_type: new Set(["joy", "sadness", "anger", "fear", "surprise", "calm", "curiosity", "unknown"]),
  relationship_type: new Set(["friend", "family", "colleague", "acquaintance", "unknown"]),
  memory_type: new Set(["episodic", "semantic", "procedural", "preference", "unknown"]),
  source_table: new Set(["mia_messages", "mia_memories", "mia_life_events", "mia_exploration_runs", "unknown"]),
});

const TIME_FIELDS = new Set(["occurred_at", "created_at", "started_at", "completed_at", "observed_at"]);
const DENIED_KEYS = new Set([
  "content", "summary", "details", "trigger_text", "trigger_details", "context",
  "context_json", "metadata", "metadata_json", "identity_profile", "stable_personality",
  "state", "profile", "name", "agent_id", "user_id", "prompt", "api_key", "token",
  "observations", "discoveries", "planner_reason", "planned_action", "before_state",
  "after_state", "source_record_id_raw",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function enumValue(field, value) {
  const allowed = ENUMS[field];
  if (!allowed) return undefined;
  return allowed.has(value) ? value : "unknown";
}

function boundedNumber(value, min, max) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : null;
}

function opaqueRef(secret, table, rawId) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("pseudonym_secret_required");
  }
  if (typeof rawId !== "string" || !rawId.length) return null;
  return createHmac("sha256", secret).update(table + ":" + rawId).digest("hex").slice(0, 24);
}

export function buildMetadataReadPlan({ startAt, endAt, limit = 200, identityScopeToken }) {
  const start = boundedTime(startAt);
  const end = boundedTime(endAt);
  if (!start || !end || Date.parse(start) >= Date.parse(end)) throw new Error("bounded_time_window_required");
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("bounded_row_limit_required");
  if (typeof identityScopeToken !== "string" || identityScopeToken.length < 16) {
    throw new Error("opaque_identity_scope_required");
  }
  return Object.freeze({
    mode: "metadata_only_read_contract",
    tables: Object.freeze(Object.entries(ADAPTER_TABLES).map(([table, columns]) => Object.freeze({
      table,
      columns,
      time_window: Object.freeze({ start_at_or_after: start, end_before: end }),
      row_limit: limit,
      identity_scope_token: identityScopeToken,
    }))),
    wildcard_projection: false,
    free_text_projection: false,
    jsonb_projection: false,
    write_operations: false,
    network_client: false,
  });
}

export function validateMetadataReadPlan(plan) {
  const violations = [];
  if (!isPlainObject(plan) || plan.mode !== "metadata_only_read_contract") {
    return { valid: false, violations: ["invalid_plan"] };
  }
  if (plan.wildcard_projection !== false) violations.push("wildcard_projection_forbidden");
  if (plan.free_text_projection !== false) violations.push("free_text_projection_forbidden");
  if (plan.jsonb_projection !== false) violations.push("jsonb_projection_forbidden");
  if (plan.write_operations !== false) violations.push("write_operations_forbidden");
  if (plan.network_client !== false) violations.push("network_client_forbidden");
  if (!Array.isArray(plan.tables) || plan.tables.length !== Object.keys(ADAPTER_TABLES).length) {
    violations.push("table_set_mismatch");
  } else {
    for (const item of plan.tables) {
      const expected = ADAPTER_TABLES[item.table];
      if (!expected || JSON.stringify(item.columns) !== JSON.stringify(expected)) violations.push("projection_not_allowlisted");
      if (!Number.isInteger(item.row_limit) || item.row_limit < 1 || item.row_limit > 500) violations.push("row_limit_invalid");
      if (!item.time_window || Date.parse(item.time_window.start_at_or_after) >= Date.parse(item.time_window.end_before)) violations.push("time_window_invalid");
      if (typeof item.identity_scope_token !== "string" || item.identity_scope_token.length < 16) violations.push("identity_scope_missing");
      for (const key of Object.keys(item)) if (DENIED_KEYS.has(key)) violations.push("denied_field_in_plan");
    }
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function projectSyntheticRows({ table, rows, pseudonymSecret, enabled = true }) {
  if (!enabled) return { enabled: false, rows: [], audit: { rows_seen: 0, rows_emitted: 0, denied: "kill_switch" } };
  const columns = ADAPTER_TABLES[table];
  if (!columns || !Array.isArray(rows)) throw new Error("unknown_table_or_rows");
  const output = [];
  for (const row of rows.slice(0, 500)) {
    if (!isPlainObject(row)) continue;
    const projected = {};
    const timestampField = columns.find((field) => TIME_FIELDS.has(field) && row[field] !== undefined);
    const timestamp = timestampField ? boundedTime(row[timestampField]) : null;
    if (!timestamp) continue;
    const id = opaqueRef(pseudonymSecret, table, row.id);
    if (!id) continue;
    projected.source_ref = id;
    projected.perspective_source = table;
    projected.occurred_at = timestamp;
    for (const field of columns) {
      if (["id", "source_record_id", "source_table", ...TIME_FIELDS].includes(field)) continue;
      if (ENUMS[field]) projected[field] = enumValue(field, row[field]);
      else if (field === "importance") projected.importance = boundedNumber(row.importance, 0, 1);
      else if (field === "intensity") projected.intensity = boundedNumber(row.intensity, 0, 1);
      else if (field === "valence") projected.valence = boundedNumber(row.valence, -1, 1);
      else if (field === "confidence") projected.confidence = boundedNumber(row.confidence, 0, 1);
    }
    if (table === "mia_exploration_runs" && projected.source_type === "virtual_simulation") {
      projected.provenance = "simulated_internal";
      projected.evidence_kind = "model_generated";
      projected.evidence_scope = "internal_state";
    } else {
      projected.provenance = "unverified_metadata";
      projected.evidence_kind = "model_generated";
      projected.evidence_scope = "internal_state";
    }
    output.push(projected);
  }
  const serialized = JSON.stringify(output);
  for (const denied of DENIED_KEYS) {
    if (new RegExp('"' + denied + '"\\s*:').test(serialized)) {
      throw new Error("denied_field_leaked:" + denied);
    }
  }
  return {
    enabled: true,
    rows: output,
    audit: { rows_seen: Math.min(rows.length, 500), rows_emitted: output.length, raw_identifiers_emitted: 0 },
  };
}

export function validateAdapterOutput(output) {
  const violations = [];
  if (!isPlainObject(output) || !Array.isArray(output.rows)) return { valid: false, violations: ["invalid_output"] };
  for (const row of output.rows) {
    if (typeof row.source_ref !== "string" || !/^[a-f0-9]{24}$/.test(row.source_ref)) violations.push("source_ref_not_pseudonymous");
    if (row.evidence_kind !== "model_generated" || row.evidence_scope !== "internal_state") violations.push("unverified_provenance_promoted");
    for (const key of Object.keys(row)) if (DENIED_KEYS.has(key)) violations.push("denied_field_emitted");
    if (row.source_type === "virtual_simulation" && row.provenance !== "simulated_internal") violations.push("simulation_provenance_lost");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}
