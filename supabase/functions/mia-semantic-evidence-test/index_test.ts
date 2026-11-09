import {
  buildExecutionReceipt,
  buildObservationEpistemics,
  classifyPlannerFailure,
  decideIdempotency,
} from "../_shared/mia-semantic-evidence.ts";
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`assertEquals failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => unknown): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error("assertThrows failed: function did not throw");
}

Deno.test("classifies missing AGNES configuration without exposing a secret", () => {
  assertEquals(
    classifyPlannerFailure({ missingConfig: true, message: "key absent" }),
    "missing_config",
  );
});

Deno.test("classifies timeout, HTTP, invalid JSON, network, and unknown failures", () => {
  assertEquals(classifyPlannerFailure({ name: "AbortError" }), "timeout");
  assertEquals(classifyPlannerFailure({ status: 502 }), "http_error");
  assertEquals(classifyPlannerFailure({ message: "JSON parse failed" }), "invalid_json");
  assertEquals(classifyPlannerFailure({ message: "fetch failed: network unavailable" }), "network_error");
  assertEquals(classifyPlannerFailure({ message: "unexpected condition" }), "unknown");
});

Deno.test("creates a persisted semantic interaction receipt with explicit capability limits", () => {
  const receipt = buildExecutionReceipt({
    requestId: "req-001",
    requestedAction: "interact",
    appliedAction: "interact",
    status: "executed",
    reason: "Local semantic interaction recorded.",
    occurredAt: "2026-11-09T05:00:00.000Z",
    beforeSequence: 4,
    afterSequence: 5,
    persisted: true,
    blocked: false,
    planner: "agnes",
  });
  assertEquals(receipt.schema, "zhi.mia.semantic-execution-receipt.v1");
  assertEquals(receipt.persistence.after_sequence, 5);
  assertEquals(receipt.execution.physical_movement, false);
  assertEquals(receipt.execution.live_perception, false);
  assertEquals(receipt.execution.cross_scene_travel, false);
});

Deno.test("blocked travel cannot be reported as executed even when mapped to wait", () => {
  assertThrows(() => buildExecutionReceipt({
    requestId: "req-travel",
    requestedAction: "travel",
    appliedAction: "wait",
    status: "executed",
    reason: "Travel blocked.",
    occurredAt: "2026-11-09T05:00:00.000Z",
    beforeSequence: 4,
    afterSequence: 5,
    persisted: true,
    blocked: true,
    planner: "agnes",
  }));
});

Deno.test("unpersisted work cannot claim a new sequence", () => {
  assertThrows(() => buildExecutionReceipt({
    requestId: "req-unpersisted",
    requestedAction: "interact",
    appliedAction: "interact",
    status: "failed",
    reason: "Persistence failed.",
    occurredAt: "2026-11-09T05:00:00.000Z",
    beforeSequence: 4,
    afterSequence: 5,
    persisted: false,
    blocked: false,
    planner: "safe_rule_fallback",
  }));
});

Deno.test("a failed receipt cannot claim persistence", () => {
  assertThrows(() => buildExecutionReceipt({
    requestId: "req-failed",
    requestedAction: "interact",
    appliedAction: "interact",
    status: "failed",
    reason: "Write failed.",
    occurredAt: "2026-11-09T05:00:00.000Z",
    beforeSequence: 4,
    afterSequence: 5,
    persisted: true,
    blocked: false,
    planner: "agnes",
  }));
});

Deno.test("duplicate request IDs are rejected", () => {
  assertEquals(
    decideIdempotency("req-1", ["req-1"], true),
    { decision: "duplicate", mayExecute: false },
  );
});

Deno.test("read-before-write without atomic claim fails closed", () => {
  assertEquals(
    decideIdempotency("req-2", [], false),
    { decision: "indeterminate", mayExecute: false },
  );
});

Deno.test("new request can proceed only when atomic claim is available", () => {
  assertEquals(
    decideIdempotency("req-3", [], true),
    { decision: "new_request", mayExecute: true },
  );
});

Deno.test("observation provenance is explicit and cannot imply physical perception", () => {
  const evidence = buildObservationEpistemics("mia_forest_autonomy_runs:run-42", 0.85);
  assertEquals(evidence.status, "observed_semantic_state");
  assertEquals(evidence.source_ref, "mia_forest_autonomy_runs:run-42");
  assertEquals(evidence.capabilities.live_perception, false);
  assertEquals(evidence.capabilities.physical_movement, false);
  assertEquals(evidence.capabilities.cross_scene_travel, false);
});

Deno.test("observation confidence must be bounded", () => {
  assertThrows(() => buildObservationEpistemics("run-42", 1.2));
});
