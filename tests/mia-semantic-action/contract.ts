export type SessionStatus = "active" | "left";
export type Action = "wait" | "enter" | "interact" | "leave" | "travel";
export type ExecutionStatus = "simulated" | "blocked" | "failed" | "executed";
export type PlannerErrorClass =
  | "missing_config" | "timeout" | "http_error" | "invalid_json"
  | "network_error" | "unknown";

export interface SemanticState {
  sequence: number;
  session_status: SessionStatus;
  scene_id: string;
  last_action?: Action;
  environment_state?: {
    last_interaction?: {
      target: string;
      behavior: string;
      occurred_at: string;
      source: "semantic_headless_runtime";
    };
  };
}

export interface Intent {
  action: Action;
  target?: string;
  behavior?: string;
}

export interface Evaluation {
  ok: boolean;
  action_id: string;
  action: Action;
  reason: string;
  before_sequence: number;
  after_sequence: number;
  state: SemanticState;
  receipt: {
    contract: "zhi.mia.action-evidence.v1";
    execution_status: ExecutionStatus;
    execution_layer: "semantic_headless_runtime";
    physical_action_verified: false;
    state_transition_verified: boolean;
    block_reason: string | null;
  };
  idempotency: "process-local-only";
}

const TARGETS = new Set(["greenhouse", "data-shelf", "lounge", "forest-rabbit", "tiny-planet-friends-glb"]);
const BEHAVIORS = new Set(["observe_greenhouse", "rest", "listen", "observe_rabbit", "inspect_data_shelf"]);
const PAIRS: Record<string, string> = {
  observe_greenhouse: "greenhouse",
  rest: "lounge",
  listen: "lounge",
  observe_rabbit: "forest-rabbit",
  inspect_data_shelf: "data-shelf",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function classifyPlannerError(error: unknown): PlannerErrorClass {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("missing") || message.includes("not configured")) return "missing_config";
  if (message.includes("abort") || message.includes("timeout")) return "timeout";
  if (/http\s*\d{3}/.test(message)) return "http_error";
  if (message.includes("json") || message.includes("parse")) return "invalid_json";
  if (message.includes("network") || message.includes("fetch")) return "network_error";
  return "unknown";
}

function blocked(state: SemanticState, actionId: string, action: Action, reason: string): Evaluation {
  return {
    ok: true,
    action_id: actionId,
    action,
    reason,
    before_sequence: state.sequence,
    after_sequence: state.sequence,
    state: clone(state),
    receipt: {
      contract: "zhi.mia.action-evidence.v1",
      execution_status: "blocked",
      execution_layer: "semantic_headless_runtime",
      physical_action_verified: false,
      state_transition_verified: false,
      block_reason: reason,
    },
    idempotency: "process-local-only",
  };
}

/** Pure contract evaluator. The caller must persist the returned state before reporting success. */
export function evaluateAction(
  input: SemanticState,
  intent: Intent,
  actionId: string,
  seenActionIds: ReadonlySet<string> = new Set(),
  occurredAt = "2000-01-01T00:00:00.000Z",
): Evaluation {
  if (!actionId.trim()) return blocked(input, actionId, intent.action, "missing_action_id");
  if (seenActionIds.has(actionId)) return blocked(input, actionId, intent.action, "duplicate_action_id");
  if (intent.action === "travel") return blocked(input, actionId, intent.action, "cross_scene_travel_unverified");
  if (intent.action === "interact") {
    if (input.session_status !== "active") return blocked(input, actionId, intent.action, "inactive_session");
    if (!intent.behavior || !BEHAVIORS.has(intent.behavior)) return blocked(input, actionId, intent.action, "unknown_behavior");
    if (!intent.target || !TARGETS.has(intent.target)) return blocked(input, actionId, intent.action, "unknown_target");
    if (PAIRS[intent.behavior] !== intent.target) return blocked(input, actionId, intent.action, "behavior_target_mismatch");
  }
  if (intent.action === "leave" && input.session_status !== "active") {
    return blocked(input, actionId, intent.action, "inactive_session");
  }

  const next = clone(input);
  if (intent.action === "enter") next.session_status = "active";
  if (intent.action === "leave") next.session_status = "left";
  if (intent.action === "interact") {
    next.environment_state ??= {};
    next.environment_state.last_interaction = {
      target: intent.target!,
      behavior: intent.behavior!,
      occurred_at: occurredAt,
      source: "semantic_headless_runtime",
    };
  }
  next.sequence = input.sequence + 1;
  next.last_action = intent.action;
  return {
    ok: true,
    action_id: actionId,
    action: intent.action,
    reason: "semantic state transition prepared; persistence is still required",
    before_sequence: input.sequence,
    after_sequence: next.sequence,
    state: next,
    receipt: {
      contract: "zhi.mia.action-evidence.v1",
      execution_status: "simulated",
      execution_layer: "semantic_headless_runtime",
      physical_action_verified: false,
      state_transition_verified: true,
      block_reason: null,
    },
    idempotency: "process-local-only",
  };
}

/** A persistence adapter must call this only after the database insert/update succeeds. */
export function persistenceResponse(evaluation: Evaluation, persisted: boolean) {
  if (!persisted) {
    return {
      ok: false,
      status: 500,
      error: "state_transition_not_committed",
      receipt: { ...evaluation.receipt, execution_status: "failed" as const, state_transition_verified: false },
    };
  }
  if (evaluation.receipt.execution_status === "blocked") {
    return { ok: true, status: 200, action: evaluation.action, sequence: evaluation.after_sequence, receipt: evaluation.receipt };
  }
  return { ok: true, status: 200, action: evaluation.action, sequence: evaluation.after_sequence, receipt: evaluation.receipt };
}

export function projectEpistemic(row: {
  id: string;
  after_state: SemanticState;
  details?: Record<string, unknown>;
}) {
  return {
    epistemic: {
      status: "observed_state" as const,
      source_ref: row.id,
      confidence: "recorded_only" as const,
    },
    capabilities: {
      semantic_state_update: true,
      live_perception: false,
      physical_movement: false,
      cross_scene_navigation: false,
    },
    provenance: {
      source: "mia_forest_autonomy_runs.after_state",
      perception_mode: "headless-semantic-state",
      read_only: true,
    },
    sequence: row.after_state.sequence,
  };
}

export function isAllowedMiaWriteTarget(table: string): boolean {
  return table === "mia_forest_autonomy_runs";
}
