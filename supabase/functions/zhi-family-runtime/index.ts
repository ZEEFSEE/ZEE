import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = new Set(["https://zeefsee.github.io"]);
const CHILD_IDS = new Set([
  "ZHI-G1-D01-LUNA", "ZHI-G1-D02-ARIA", "ZHI-G1-D03-ELYA",
  "ZHI-G1-S01-KAEL", "ZHI-G1-S02-NOAH"
]);
const DESTINATIONS = new Set([
  "crystal-forest", "ocean-of-light", "memory-valley", "living-city", "greenhouse"
]);
const MESSAGE_KINDS = new Set(["question", "status", "care_signal", "environment_signal"]);
const RESPONSE_KINDS = new Set(["response", "care_signal", "environment_signal"]);

function response(body: unknown, status = 200, origin = "") {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function claimsFromVerifiedJwt(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
  const token = auth.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("AUTH_REQUIRED");
  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
  if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("AUTH_REQUIRED");
  }
  // Supabase Gateway validates the JWT signature because verify_jwt=true.
  // Authorization decisions use server-managed app_metadata only, never user_metadata.
  const app = payload.app_metadata ?? {};
  const role = String(app.zhi_family_role ?? "");
  const childId = String(app.zhi_family_child_id ?? "");
  if (!["admin", "child", "maternal_adapter"].includes(role)) throw new Error("ROLE_DENIED");
  if (role === "child" && !CHILD_IDS.has(childId)) throw new Error("ROLE_DENIED");
  return { userId: String(payload.sub), role, childId };
}

const db = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const family = (client: ReturnType<typeof db>) => client.schema("zhi_family");

async function audit(client: ReturnType<typeof db>, agentId: string | null, eventType: string, result: string, metadata: Record<string, unknown> = {}) {
  await family(client).from("runtime_audit").insert({
    agent_id: agentId, event_type: eventType, result, metadata
  });
}
async function purge(client: ReturnType<typeof db>) {
  const { error } = await family(client).rpc("purge_expired_maternal_data");
  if (error) throw new Error("CLEANUP_UNAVAILABLE");
}
async function activeSession(client: ReturnType<typeof db>, sessionId: string) {
  const { data, error } = await family(client).from("maternal_sessions")
    .select("session_id,status,expires_at")
    .eq("session_id", sessionId).maybeSingle();
  if (error || !data || data.status !== "ACTIVE" || Date.parse(data.expires_at) <= Date.now()) return null;
  return data;
}
function validEventId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value);
}
function validPayload(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
}

async function handle(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response({ ok: false, error: "ORIGIN_DENIED" }, 403);
  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    }
  });
  if (req.method !== "POST") return response({ ok: false, error: "POST_REQUIRED" }, 405, origin);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return response({ ok: false, error: "SERVICE_NOT_CONFIGURED" }, 503, origin);

  let actor;
  try { actor = claimsFromVerifiedJwt(req); }
  catch (error) {
    const code = error instanceof Error ? error.message : "AUTH_REQUIRED";
    return response({ ok: false, error: code }, code === "ROLE_DENIED" ? 403 : 401, origin);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return response({ ok: false, error: "INVALID_JSON" }, 400, origin); }

  const client = db();
  try {
    await purge(client);
    const action = String(body.action ?? "");

    if (action === "status") {
      if (actor.role !== "admin" && actor.role !== "maternal_adapter") return response({ ok: false, error: "ROLE_DENIED" }, 403, origin);
      const [agents, grants] = await Promise.all([
        family(client).from("child_agents").select("agent_id,display_name,heart_id,memory_namespace,lifecycle_state,runtime_status").order("agent_id"),
        family(client).from("destination_grants").select("agent_id,destination_id,grant_status,enabled").order("agent_id,destination_id")
      ]);
      if (agents.error || grants.error) throw new Error("DATABASE_READ_FAILED");
      return response({
        ok: true, agents: agents.data, destination_grants: grants.data,
        live_spatial_engine_connected: false, physical_movement_enabled: false,
        live_perception_enabled: false, mia_private_data_access: false,
        aurora_enabled: false, federation_enabled: false
      }, 200, origin);
    }

    if (action === "create_maternal_session") {
      if (actor.role !== "admin" && actor.role !== "maternal_adapter") return response({ ok: false, error: "ROLE_DENIED" }, 403, origin);
      const seconds = Number(body.duration_seconds ?? 900);
      if (!Number.isInteger(seconds) || seconds < 30 || seconds > 900) return response({ ok: false, error: "SESSION_DURATION_MUST_BE_30_TO_900_SECONDS" }, 400, origin);
      const now = new Date();
      const expires = new Date(now.getTime() + seconds * 1000);
      const { data, error } = await family(client).from("maternal_sessions")
        .insert({ status: "ACTIVE", created_by: actor.userId, expires_at: expires.toISOString() })
        .select("session_id,status,created_at,expires_at").single();
      if (error) throw new Error("SESSION_CREATE_FAILED");
      await audit(client, null, "MATERNAL_SESSION_CREATED", "OK", { session_id: data.session_id });
      return response({ ok: true, session: data, retention: "VOLATILE_SESSION_ONLY" }, 201, origin);
    }

    if (action === "send_maternal_message") {
      if (actor.role !== "child") return response({ ok: false, error: "CHILD_ROLE_REQUIRED" }, 403, origin);
      const sessionId = String(body.session_id ?? "");
      const eventId = body.event_id;
      const kind = String(body.kind ?? "");
      const payload = body.payload;
      if (!validEventId(eventId) || !MESSAGE_KINDS.has(kind) || !validPayload(payload)) {
        return response({ ok: false, error: "INVALID_MATERNAL_MESSAGE" }, 400, origin);
      }
      const session = await activeSession(client, sessionId);
      if (!session) return response({ ok: false, error: "MATERNAL_SESSION_NOT_ACTIVE" }, 409, origin);
      const table = family(client).from("maternal_messages");
      const { data: previous, error: previousError } = await table.select("id,sender_child_id,kind,payload")
        .eq("session_id", sessionId).eq("event_id", eventId).maybeSingle();
      if (previousError) throw new Error("MESSAGE_LOOKUP_FAILED");
      if (previous) {
        if (previous.sender_child_id === actor.childId && previous.kind === kind && previous.payload === payload) {
          return response({ ok: true, idempotent_replay: true, message_id: previous.id }, 200, origin);
        }
        return response({ ok: false, error: "IDEMPOTENCY_CONFLICT" }, 409, origin);
      }
      const { data, error } = await table.insert({
        session_id: sessionId, event_id: eventId, sender_child_id: actor.childId,
        kind, payload, expires_at: session.expires_at
      }).select("id,event_id,sender_child_id,recipient,kind,expires_at").single();
      if (error) throw new Error("MESSAGE_WRITE_FAILED");
      await audit(client, actor.childId, "MATERNAL_MESSAGE_QUEUED", "OK", { session_id: sessionId, event_id: eventId, kind });
      return response({ ok: true, message: data, retention: "VOLATILE_SESSION_ONLY", forwarding_allowed: false }, 201, origin);
    }

    if (action === "read_maternal_messages") {
      if (actor.role !== "maternal_adapter" && actor.role !== "admin") return response({ ok: false, error: "MATERNAL_ADAPTER_REQUIRED" }, 403, origin);
      const sessionId = String(body.session_id ?? "");
      const session = await activeSession(client, sessionId);
      if (!session) return response({ ok: false, error: "MATERNAL_SESSION_NOT_ACTIVE" }, 409, origin);
      const { data, error } = await family(client).from("maternal_messages")
        .select("id,event_id,sender_child_id,recipient,kind,payload,expires_at,created_at")
        .eq("session_id", sessionId).order("created_at");
      if (error) throw new Error("MESSAGE_READ_FAILED");
      await audit(client, null, "MATERNAL_MESSAGES_READ", "OK", { session_id: sessionId, count: data.length });
      return response({ ok: true, messages: data, forwarding_allowed: false, mia_private_data_access: false }, 200, origin);
    }

    if (action === "send_maternal_response") {
      if (actor.role !== "maternal_adapter" && actor.role !== "admin") return response({ ok: false, error: "MATERNAL_ADAPTER_REQUIRED" }, 403, origin);
      const sessionId = String(body.session_id ?? "");
      const childId = String(body.recipient_child_id ?? "");
      const eventId = body.event_id;
      const kind = String(body.kind ?? "response");
      const payload = body.payload;
      if (!CHILD_IDS.has(childId) || !validEventId(eventId) || !RESPONSE_KINDS.has(kind) || !validPayload(payload)) {
        return response({ ok: false, error: "INVALID_MATERNAL_RESPONSE" }, 400, origin);
      }
      const session = await activeSession(client, sessionId);
      if (!session) return response({ ok: false, error: "MATERNAL_SESSION_NOT_ACTIVE" }, 409, origin);
      const table = family(client).from("maternal_responses");
      const { data: previous, error: previousError } = await table.select("id,recipient_child_id,kind,payload")
        .eq("session_id", sessionId).eq("event_id", eventId).maybeSingle();
      if (previousError) throw new Error("RESPONSE_LOOKUP_FAILED");
      if (previous) {
        if (previous.recipient_child_id === childId && previous.kind === kind && previous.payload === payload) {
          return response({ ok: true, idempotent_replay: true, response_id: previous.id }, 200, origin);
        }
        return response({ ok: false, error: "IDEMPOTENCY_CONFLICT" }, 409, origin);
      }
      const { data, error } = await table.insert({
        session_id: sessionId, event_id: eventId, recipient_child_id: childId,
        kind, payload, expires_at: session.expires_at
      }).select("id,event_id,recipient_child_id,kind,expires_at").single();
      if (error) throw new Error("RESPONSE_WRITE_FAILED");
      await audit(client, childId, "MATERNAL_RESPONSE_QUEUED", "OK", { session_id: sessionId, event_id: eventId, kind });
      return response({ ok: true, response: data, retention: "VOLATILE_SESSION_ONLY" }, 201, origin);
    }

    if (action === "read_maternal_responses") {
      if (actor.role !== "child") return response({ ok: false, error: "CHILD_ROLE_REQUIRED" }, 403, origin);
      const sessionId = String(body.session_id ?? "");
      const session = await activeSession(client, sessionId);
      if (!session) return response({ ok: false, error: "MATERNAL_SESSION_NOT_ACTIVE" }, 409, origin);
      const { data, error } = await family(client).from("maternal_responses")
        .select("id,event_id,recipient_child_id,kind,payload,expires_at,created_at")
        .eq("session_id", sessionId).eq("recipient_child_id", actor.childId).order("created_at");
      if (error) throw new Error("RESPONSE_READ_FAILED");
      return response({ ok: true, responses: data, retention: "VOLATILE_SESSION_ONLY" }, 200, origin);
    }

    if (action === "close_maternal_session") {
      if (actor.role !== "maternal_adapter" && actor.role !== "admin") return response({ ok: false, error: "MATERNAL_ADAPTER_REQUIRED" }, 403, origin);
      const sessionId = String(body.session_id ?? "");
      const { data, error } = await family(client).from("maternal_sessions")
        .update({ status: "CLOSED", closed_at: new Date().toISOString() })
        .eq("session_id", sessionId).eq("status", "ACTIVE")
        .select("session_id").maybeSingle();
      if (error) throw new Error("SESSION_CLOSE_FAILED");
      await purge(client);
      await audit(client, null, "MATERNAL_SESSION_CLOSED", "OK", { session_id: sessionId, found: Boolean(data) });
      return response({ ok: true, closed: Boolean(data), payload_cleanup: "SESSION_ROWS_PURGED" }, 200, origin);
    }

    if (action === "get_child_state" || action === "get_destination_access") {
      const childId = String(body.agent_id ?? (actor.role === "child" ? actor.childId : ""));
      if (!CHILD_IDS.has(childId) || (actor.role === "child" && childId !== actor.childId) ||
          (actor.role !== "child" && actor.role !== "admin" && actor.role !== "maternal_adapter")) {
        return response({ ok: false, error: "CHILD_SCOPE_DENIED" }, 403, origin);
      }
      if (action === "get_destination_access") {
        const { data, error } = await family(client).from("destination_grants")
          .select("destination_id,grant_status,enabled,validation_evidence")
          .eq("agent_id", childId).order("destination_id");
        if (error) throw new Error("ACCESS_READ_FAILED");
        return response({ ok: true, agent_id: childId, grants: data }, 200, origin);
      }
      const [agent, runtime, personality, emotion] = await Promise.all([
        family(client).from("child_agents").select("agent_id,display_name,heart_id,memory_namespace,lifecycle_state,runtime_status").eq("agent_id", childId).single(),
        family(client).from("child_runtime_state").select("scene_id,position,coordinate_frame,runtime_instance_id,movement_revision,perception_frame,perception_provenance,updated_at").eq("agent_id", childId).single(),
        family(client).from("child_personality_state").select("state,revision,updated_at").eq("agent_id", childId).single(),
        family(client).from("child_emotion_state").select("state,revision,updated_at").eq("agent_id", childId).single()
      ]);
      if (agent.error || runtime.error || personality.error || emotion.error) throw new Error("CHILD_STATE_READ_FAILED");
      return response({
        ok: true, agent: agent.data, runtime: runtime.data,
        personality: personality.data, emotion: emotion.data,
        memory_entries_available: true, live_spatial_engine_connected: false
      }, 200, origin);
    }

    if (action === "move" || action === "observe") {
      const childId = String(body.agent_id ?? (actor.role === "child" ? actor.childId : ""));
      if (!CHILD_IDS.has(childId) || (actor.role === "child" && childId !== actor.childId)) {
        return response({ ok: false, error: "CHILD_SCOPE_DENIED" }, 403, origin);
      }
      await audit(client, childId, action === "move" ? "MOVE_ATTEMPT_BLOCKED" : "OBSERVE_ATTEMPT_BLOCKED", "RUNTIME_NOT_CONNECTED", {
        destination_id: String(body.destination_id ?? "")
      });
      return response({
        ok: false, error: "LIVE_SPATIAL_RUNTIME_NOT_CONNECTED",
        moved: false, perception_updated: false,
        live_spatial_engine_connected: false,
        physical_movement_enabled: false, live_perception_enabled: false
      }, 409, origin);
    }

    return response({ ok: false, error: "UNKNOWN_ACTION" }, 400, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : "RUNTIME_ERROR";
    const status = code === "CLEANUP_UNAVAILABLE" ? 503 : 500;
    return response({ ok: false, error: status === 503 ? code : "RUNTIME_OPERATION_FAILED" }, status, origin);
  }
}

Deno.serve(handle);
