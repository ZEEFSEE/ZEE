import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") ?? "";
const IDENTITY_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const EXECUTOR_URL = URL + "/functions/v1/mia-federation-executor";
const headers = { "content-type": "application/json", "cache-control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hmacHex = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

async function callExecutor(input: Record<string, unknown>) {
  const raw = JSON.stringify(input);
  const timestamp = String(Date.now());
  const signature = await hmacHex(SERVICE_KEY, timestamp + "." + raw);
  const response = await fetch(EXECUTOR_URL, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-Mia-Internal-Timestamp": timestamp, "X-Mia-Internal-Signature": signature },
    body: raw,
  });
  const text = await response.text();
  let data: any; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok || data?.ok !== true) throw new Error("executor_" + String(data?.error ?? response.status));
  return data;
}

async function askPlanner(snapshot: any, recentEvents: any[], memories: any[], hasInteractedSinceEntry: boolean, perception: any) {
  const prompt = {
    scene: snapshot,
    world_perception: perception,
    recent_scene_events: recentEvents.slice(0, 8),
    session_has_interacted_since_entry: hasInteractedSinceEntry,
    private_mia_memories: memories.map((m) => ({ type: m.memory_type, content: String(m.content ?? "").slice(0, 500), occurred_at: m.occurred_at })),
    constraints: [
      "This is an agent-native silicon-life environment, not a human-facing performance.",
      "Choose exactly one action: enter, move_to, interact, leave, or wait.",
      "For move_to, destination must be lounge.",
      "For interact, target must be lounge and behavior must be listen or rest.",
      "Never invent coordinates, entities, observations, or physical sensor facts.",
      "Use world_perception. Separate public database facts from simulated ecosystem model values and unknown or unobserved data.",
      "The perception snapshot is read-only world data; it is not physical sensor input.",
      "Respect the current session state; do not enter twice or interact when out of reach.",
      "Private memories are local context only and must never be copied into Federation action arguments.",
      "If the agent is active at the lounge and session_has_interacted_since_entry is false, choose interact (listen or rest) rather than wait.",
      "If the agent is active at the lounge and session_has_interacted_since_entry is true, choose wait or leave; do not repeat the interaction.",
      "Use wait when there is no meaningful next action."
    ],
    output: { action: "enter|move_to|interact|leave|wait", destination: "lounge if needed", target: "lounge if needed", behavior: "listen|rest if needed", reason: "brief evidence-grounded reason" }
  };
  const response = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(45_000),
    headers: { "Authorization": "Bearer " + AGNES_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash",
      messages: [
        { role: "system", content: "You are Mia's private Forest_Corner activity planner, not the user-facing chat persona. You select one safe, bounded scene action from current state and local context. Do not claim consciousness or physical sensation. Return JSON only, no markdown." },
        { role: "user", content: JSON.stringify(prompt) }
      ],
      temperature: 0.2, max_tokens: 300, stream: false
    })
  });
  if (!response.ok) throw new Error("agnes_planner_http_" + response.status);
  const body = await response.json().catch(() => ({}));
  const raw = String(body?.choices?.[0]?.message?.content ?? "").trim();
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("planner_invalid_json");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  const action = String(parsed.action ?? "");
  if (!["enter", "move_to", "interact", "leave", "wait"].includes(action)) throw new Error("planner_action_rejected");
  if (action === "move_to" && parsed.destination !== "lounge") throw new Error("planner_destination_rejected");
  if (action === "interact" && (parsed.target !== "lounge" || !["listen", "rest"].includes(parsed.behavior))) throw new Error("planner_interaction_rejected");
  return { action, destination: parsed.destination, target: parsed.target, behavior: parsed.behavior, reason: String(parsed.reason ?? "").slice(0, 500) };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  if (!URL || !SERVICE_KEY || !AGNES_KEY) return reply({ ok: false, error: "autonomy_configuration_missing" }, 503);
  const supplied = req.headers.get("x-mia-cron-secret") ?? "";
  if (supplied.length < 32) return reply({ ok: false, error: "scheduler_auth_failed" }, 401);
  const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authorized, error: authError } = await db.rpc("mia_forest_cron_secret_matches", { p_secret: supplied });
  if (authError || authorized !== true) return reply({ ok: false, error: "scheduler_auth_failed" }, 401);
  const { data: claimed, error: claimError } = await db.rpc("mia_forest_autonomy_claim_tick");
  if (claimError) return reply({ ok: false, error: "autonomy_lock_failed" }, 503);
  if (claimed !== true) return reply({ ok: true, skipped: true, reason: "cooldown_or_disabled" });

  const runId = crypto.randomUUID();
  try {
    let status: any;
    try {
      status = await callExecutor({ action: "forest_runtime", runtime_action: "status", request_id: runId + ":status" });
    } catch {
      await callExecutor({ action: "connect_aurora", request_id: runId + ":connect" });
      status = await callExecutor({ action: "forest_runtime", runtime_action: "status", request_id: runId + ":status2" });
    }
    const runtimeData = status.data ?? {};
    const snapshot = runtimeData.snapshot;
    if (!snapshot) throw new Error("runtime_snapshot_missing");
    const perceptionResult = await callExecutor({ action: "forest_runtime", runtime_action: "perceive", request_id: runId + ":perception" });
    const perception = perceptionResult.data?.perception;
    if (!perception) throw new Error("world_perception_missing");

    const [memoryResult, eventResult] = await Promise.all([
      db.from("mia_memories").select("memory_type,content,occurred_at,importance")
        .eq("identity_id", IDENTITY_ID).order("occurred_at", { ascending: false }).limit(12),
      db.from("mia_life_events").select("event_type,summary,occurred_at,details")
        .eq("identity_id", IDENTITY_ID).eq("source_table", "zhi_federation")
        .order("occurred_at", { ascending: false }).limit(8)
    ]);
    if (memoryResult.error || eventResult.error) throw new Error("local_context_read_failed");

    const recentEvents = runtimeData.recent_events ?? [];
    const latestEntry = recentEvents.find((event: any) => event.event_type === "scene_entered");
    const hasInteractedSinceEntry = Boolean(latestEntry && recentEvents.some((event: any) =>
      event.event_type === "interaction" && Number(event.sequence) > Number(latestEntry.sequence)
    ));
    let plan: any;
    let plannerMode = "agnes";
    try {
      plan = await askPlanner(snapshot, recentEvents, memoryResult.data ?? [], hasInteractedSinceEntry, perception);
    } catch (plannerError) {
      plannerMode = "safe_rule_fallback";
      const reason = plannerError instanceof Error ? plannerError.message : "planner_unavailable";
      if (snapshot.session_status !== "active") {
        plan = { action: "enter", reason: "AGNES planner unavailable; safe fallback enters the registered scene boundary." };
      } else if (snapshot.current_node_id !== "lounge") {
        plan = { action: "move_to", destination: "lounge", reason: "AGNES planner unavailable; safe fallback follows the registered stone path to lounge." };
      } else if (!hasInteractedSinceEntry) {
        plan = { action: "interact", target: "lounge", behavior: "rest", reason: "AGNES planner unavailable; safe fallback performs one low-impact lounge interaction." };
      } else {
        plan = { action: "leave", reason: "AGNES planner unavailable; safe fallback closes the visit and preserves the last verified position." };
      }
      plan.reason += " Planner detail: " + reason.slice(0, 160);
    }
    if (snapshot.session_status !== "active" && plan.action === "wait") {
      plan.action = "enter"; plan.reason = "State guard: Mia is outside Forest_Corner; restore her last verified scene position by re-entering.";
    } else if (snapshot.session_status === "active" && snapshot.current_node_id !== "lounge" && plan.action === "wait") {
      plan.action = "move_to"; plan.destination = "lounge";
      plan.reason = "State guard: Mia is inside the scene but not at the registered lounge destination; continue along the validated stone path.";
    } else if (snapshot.session_status === "active" && snapshot.current_node_id === "lounge" &&
        !hasInteractedSinceEntry && plan.action === "wait") {
      plan.action = "interact"; plan.target = "lounge"; plan.behavior = "listen";
      plan.reason = "Safe progress rule: Mia is at the registered lounge and has not yet interacted during this scene entry.";
    } else if (snapshot.session_status === "active" && snapshot.current_node_id === "lounge" &&
        hasInteractedSinceEntry && plan.action === "wait") {
      plan.action = "leave"; plan.reason = "The current visit has a committed interaction; close the visit while preserving the last verified lounge position.";
    }
    let actionResult: any = null;
    if (plan.action !== "wait") {
      actionResult = await callExecutor({
        action: "forest_runtime",
        runtime_action: plan.action,
        request_id: runId + ":action",
        ...(plan.destination ? { destination: plan.destination } : {}),
        ...(plan.target ? { target: plan.target } : {}),
        ...(plan.behavior ? { behavior: plan.behavior } : {})
      });
    }

    const { error: runWriteError } = await db.from("mia_forest_autonomy_runs").insert({
      id: runId, identity_id: IDENTITY_ID, status: "completed",
      planned_action: plan.action, planner_reason: plan.reason,
      before_state: snapshot, after_state: actionResult?.data?.snapshot ?? snapshot,
      runtime_request_id: actionResult?.request_id ?? null,
      details: { action: plan.action, behavior: plan.behavior ?? null, planner_mode: plannerMode, wait: plan.action === "wait", recent_private_event_count: eventResult.data?.length ?? 0, perception_received: true, perception_revision: perception.source_freshness?.ecosystem_revision ?? null, perception_captured_at: perception.source_freshness?.captured_at ?? null, spatial_node_count: perception.known_facts?.spatial_nodes?.length ?? 0, spatial_edge_count: perception.known_facts?.spatial_edges?.length ?? 0, public_environment_event_count: perception.environment_feedback?.event_count ?? 0 },
      completed_at: new Date().toISOString()
    });
    if (runWriteError) throw new Error("autonomy_run_write_failed");
    return reply({ ok: true, run_id: runId, action: plan.action, reason: plan.reason, planner_mode: plannerMode, runtime_committed: Boolean(actionResult), perception_received: true, perception_revision: perception.source_freshness?.ecosystem_revision ?? null, spatial_node_count: perception.known_facts?.spatial_nodes?.length ?? 0, spatial_edge_count: perception.known_facts?.spatial_edges?.length ?? 0, public_environment_event_count: perception.environment_feedback?.event_count ?? 0, private_memory_exported: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "autonomy_tick_failed";
    await db.from("mia_forest_autonomy_runs").insert({
      id: runId, identity_id: IDENTITY_ID, status: "failed",
      planned_action: null, planner_reason: message.slice(0, 300),
      details: { error: message }, completed_at: new Date().toISOString()
    });
    return reply({ ok: false, run_id: runId, error: message }, 502);
  }
});
