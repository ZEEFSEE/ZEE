/**
 * Pure, side-effect-free contracts for Mia's semantic headless action receipts.
 *
 * This module is intentionally not wired into the production Edge Function.
 * It must not import Supabase clients, read environment variables, or write data.
 */

export type PlannerErrorKind =
  | "missing_config"
  | "timeout"
  | "http_error"
  | "invalid_json"
  | "network_error"
  | "unknown";

export interface PlannerFailure {
  name?: string;
  message?: string;
  status?: number;
  missingConfig?: boolean;
}

export function classifyPlannerFailure(
  failure: PlannerFailure,
): PlannerErrorKind {
  if (failure.missingConfig) return "missing_config";
  if (failure.status !== undefined) return "http_error";
  const name = (failure.name ?? "").toLowerCase();
  const message = (failure.message ?? "").toLowerCase();
  if (name.includes("abort") || message.includes("timeout") ||
    message.includes("timed out") || message.includes("aborted")) {
    return "timeout";
  }
  if (message.includes("json") || message.includes("parse")) {
    return "invalid_json";
  }
  if (name.includes("network") || message.includes("network") ||
    message.includes("fetch failed")) {
    return "network_error";
  }
  return "unknown";
}

export type SemanticAction =
  | "wait"
  | "enter"
  | "interact"
  | "leave"
  | "travel";

export type ReceiptStatus = "executed" | "blocked" | "failed" | "skipped";

export interface ExecutionReceiptInput {
  requestId: string;
  requestedAction: SemanticAction | string;
  appliedAction: SemanticAction | string | null;
  status: ReceiptStatus;
  reason: string;
  occurredAt: string;
  beforeSequence: number;
  afterSequence: number | null;
  persisted: boolean;
  blocked: boolean;
  planner: "agnes" | "safe_rule_fallback";
  plannerErrorKind?: PlannerErrorKind | null;
}

export interface ExecutionReceipt {
  schema: "zhi.mia.semantic-execution-receipt.v1";
  request_id: string;
  status: ReceiptStatus;
  requested_action: string;
  applied_action: string | null;
  blocked: boolean;
  reason: string;
  occurred_at: string;
  persistence: {
    persisted: boolean;
    before_sequence: number;
    after_sequence: number | null;
  };
  planner: {
    provider: "agnes" | "safe_rule_fallback";
    error_kind: PlannerErrorKind | null;
  };
  execution: {
    layer: "semantic_headless_runtime";
    physical_movement: false;
    live_perception: false;
    cross_scene_travel: false;
  };
}

function safeText(value: string, max = 500): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}

export function buildExecutionReceipt(
  input: ExecutionReceiptInput,
): ExecutionReceipt {
  if (!input.requestId.trim()) throw new Error("requestId is required");
  if (!Number.isInteger(input.beforeSequence) || input.beforeSequence < 0) {
    throw new Error("beforeSequence must be a non-negative integer");
  }
  if (input.persisted && (
    input.afterSequence === null ||
    !Number.isInteger(input.afterSequence) ||
    input.afterSequence <= input.beforeSequence
  )) {
    throw new Error("persisted receipt requires an advancing afterSequence");
  }
  if (!input.persisted && input.afterSequence !== null) {
    throw new Error("unpersisted receipt must not claim an afterSequence");
  }
  if (input.blocked && input.status === "executed") {
    throw new Error("blocked action cannot have executed status");
  }
  if (input.status === "executed" && (!input.persisted || input.blocked)) {
    throw new Error("executed status requires persisted, unblocked result");
  }
  if (input.status === "failed" && input.persisted) {
    throw new Error("failed status cannot claim successful persistence");
  }

  return {
    schema: "zhi.mia.semantic-execution-receipt.v1",
    request_id: safeText(input.requestId, 160),
    status: input.status,
    requested_action: safeText(input.requestedAction, 80),
    applied_action: input.appliedAction === null
      ? null
      : safeText(input.appliedAction, 80),
    blocked: input.blocked,
    reason: safeText(input.reason),
    occurred_at: input.occurredAt,
    persistence: {
      persisted: input.persisted,
      before_sequence: input.beforeSequence,
      after_sequence: input.afterSequence,
    },
    planner: {
      provider: input.planner,
      error_kind: input.plannerErrorKind ?? null,
    },
    execution: {
      layer: "semantic_headless_runtime",
      physical_movement: false,
      live_perception: false,
      cross_scene_travel: false,
    },
  };
}

export type IdempotencyDecision =
  | { decision: "new_request"; mayExecute: true }
  | { decision: "duplicate"; mayExecute: false }
  | { decision: "indeterminate"; mayExecute: false };

export function decideIdempotency(
  requestId: string,
  persistedRequestIds: readonly string[],
  atomicClaimAvailable: boolean,
): IdempotencyDecision {
  if (!requestId.trim()) {
    return { decision: "indeterminate", mayExecute: false };
  }
  if (persistedRequestIds.includes(requestId)) {
    return { decision: "duplicate", mayExecute: false };
  }
  // A read-before-write check alone is race-prone. Without an atomic claim,
  // fail closed rather than imply exactly-once execution.
  if (!atomicClaimAvailable) {
    return { decision: "indeterminate", mayExecute: false };
  }
  return { decision: "new_request", mayExecute: true };
}

export interface ObservationEpistemics {
  status: "observed_semantic_state" | "inferred" | "unknown";
  source_ref: string;
  confidence: number;
  capabilities: {
    live_perception: false;
    physical_movement: false;
    cross_scene_travel: false;
  };
}

export function buildObservationEpistemics(
  sourceRef: string,
  confidence: number,
): ObservationEpistemics {
  if (!sourceRef.trim()) throw new Error("sourceRef is required");
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  return {
    status: "observed_semantic_state",
    source_ref: safeText(sourceRef, 240),
    confidence,
    capabilities: {
      live_perception: false,
      physical_movement: false,
      cross_scene_travel: false,
    },
  };
}
