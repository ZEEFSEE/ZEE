import {
  classifyPlannerError,
  evaluateAction,
  isAllowedMiaWriteTarget,
  persistenceResponse,
  projectEpistemic,
  type SemanticState,
} from "./contract.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`);
}
function fixture(overrides: Partial<SemanticState> = {}): SemanticState {
  return { sequence: 7, session_status: "active", scene_id: "mia-forest-corner", ...overrides };
}

Deno.test("valid local interaction produces simulated receipt and advances one sequence", () => {
  const r = evaluateAction(fixture(), { action: "interact", target: "greenhouse", behavior: "observe_greenhouse" }, "a-1");
  equal(r.receipt.execution_status, "simulated", "status");
  equal(r.before_sequence, 7, "before");
  equal(r.after_sequence, 8, "after");
  equal(r.state.environment_state?.last_interaction?.target, "greenhouse", "target");
  equal(r.receipt.physical_action_verified, false, "physical verification");
});

Deno.test("unknown target is blocked without changing state", () => {
  const r = evaluateAction(fixture(), { action: "interact", target: "unknown-place", behavior: "observe_greenhouse" }, "a-2");
  equal(r.receipt.execution_status, "blocked", "status");
  equal(r.after_sequence, 7, "sequence");
  equal(r.receipt.block_reason, "unknown_target", "reason");
});

Deno.test("inactive session interaction is blocked", () => {
  const r = evaluateAction(fixture({ session_status: "left" }), { action: "interact", target: "greenhouse", behavior: "observe_greenhouse" }, "a-3");
  equal(r.receipt.block_reason, "inactive_session", "reason");
  equal(r.after_sequence, 7, "sequence");
});

Deno.test("cross-scene travel remains blocked and is not rewritten as wait", () => {
  const r = evaluateAction(fixture(), { action: "travel" }, "a-4");
  equal(r.action, "travel", "requested action retained");
  equal(r.receipt.execution_status, "blocked", "status");
  equal(r.after_sequence, 7, "sequence");
});

Deno.test("planner errors map to bounded non-secret classes", () => {
  equal(classifyPlannerError(new Error("request timeout")), "timeout", "timeout");
  equal(classifyPlannerError(new Error("invalid JSON response")), "invalid_json", "json");
  equal(classifyPlannerError(new Error("AGNES HTTP 502")), "http_error", "http");
  equal(classifyPlannerError(new Error("AGNES_API_KEY missing")), "missing_config", "config");
});

Deno.test("duplicate action ID is rejected by the supplied idempotency ledger", () => {
  const r = evaluateAction(fixture(), { action: "wait" }, "same-id", new Set(["same-id"]));
  equal(r.receipt.block_reason, "duplicate_action_id", "reason");
  equal(r.after_sequence, 7, "sequence");
});

Deno.test("persistence failure never returns success", () => {
  const r = evaluateAction(fixture(), { action: "wait" }, "a-7");
  const response = persistenceResponse(r, false);
  equal(response.ok, false, "ok");
  equal(response.status, 500, "status");
  equal(response.receipt.execution_status, "failed", "receipt");
});

Deno.test("observation projection declares recorded semantic state, not live perception", () => {
  const p = projectEpistemic({ id: "run-1", after_state: fixture() });
  equal(p.epistemic.confidence, "recorded_only", "confidence");
  equal(p.capabilities.live_perception, false, "perception");
  equal(p.capabilities.physical_movement, false, "movement");
  equal(p.provenance.read_only, true, "read-only");
});

Deno.test("write-target guard excludes chat and private cognitive tables", () => {
  assert(isAllowedMiaWriteTarget("mia_forest_autonomy_runs"), "autonomy run table should be allowed");
  for (const table of ["mia_messages", "mia_memories", "mia_personality_state", "mia_emotion_events", "mia_relationship_context"]) {
    equal(isAllowedMiaWriteTarget(table), false, `${table} must be excluded`);
  }
});

Deno.test("valid wait is a real semantic transition; blocked actions are not", () => {
  const wait = evaluateAction(fixture(), { action: "wait" }, "a-10");
  equal(wait.after_sequence, 8, "wait advances");
  const blocked = evaluateAction(fixture(), { action: "travel" }, "a-11");
  equal(blocked.after_sequence, 7, "blocked action does not advance");
});
