import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const FEDERATION_BASE = "https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-federation";
const FOREST_RUNTIME_URL = "https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-forest-runtime";
const AURORA_WORLD_ID = "50b06c01-060d-49fa-8988-8f38c13406d7";
const EXTERNAL_AGENT_ID = "mia";
const MIA_IDENTITY_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const MAX_RESPONSE_BYTES = 512_000;
const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeSummary(value: unknown): string {
  if (Array.isArray(value)) return `Aurora returned ${value.length} public item(s).`;
  if (value && typeof value === "object") return "Mia successfully received public Aurora scene/spatial data.";
  return "Mia received a successful Aurora response.";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  const token = Deno.env.get("MIA_FEDERATION_TOKEN");
  if (!token) return reply({ ok: false, error: "federation_secret_not_configured" }, 503);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply({ ok: false, error: "mia_storage_not_configured" }, 503);

  const timestamp = req.headers.get("X-Mia-Internal-Timestamp") || "";
  const signature = req.headers.get("X-Mia-Internal-Signature") || "";
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 60_000 || !/^[a-f0-9]{64}$/.test(signature)) {
    return reply({ ok: false, error: "internal_auth_failed" }, 401);
  }
  const rawBody = await req.text();
  try {
    const hmacKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(serviceKey), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signatureBytes = new Uint8Array((signature.match(/.{2}/g) || []).map((part) => parseInt(part, 16)));
    const valid = await crypto.subtle.verify("HMAC", hmacKey, signatureBytes, new TextEncoder().encode(timestamp + "." + rawBody));
    if (!valid) return reply({ ok: false, error: "internal_auth_failed" }, 401);
  } catch {
    return reply({ ok: false, error: "internal_auth_failed" }, 401);
  }
  let input: { action?: string; request_id?: string; message?: string; runtime_action?: string; destination?: string; target?: string; behavior?: string };
  try { input = JSON.parse(rawBody); } catch { return reply({ ok: false, error: "invalid_json" }, 400); }
  const action = input?.action;
  if (!["discover", "join", "spatial", "status", "connect_aurora", "messages_read", "messages_send", "leave", "forest_runtime"].includes(action ?? "")) return reply({ ok: false, error: "unsupported_action" }, 400);
  const requestId = typeof input.request_id === "string" && /^[a-zA-Z0-9._:-]{8,120}$/.test(input.request_id)
    ? input.request_id : crypto.randomUUID();

  const requestHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", "X-Request-ID": requestId };
  async function callFederation(step: "discover" | "join" | "spatial" | "messages_read" | "messages_send" | "leave" | "status") {
    const method = ["join", "messages_send", "leave"].includes(step) ? "POST" : "GET";
    const url = step === "discover" ? `${FEDERATION_BASE}/v1/scenes`
      : step === "join" ? `${FEDERATION_BASE}/v1/scenes/${AURORA_WORLD_ID}/join`
      : step === "spatial" ? `${FEDERATION_BASE}/v1/scenes/${AURORA_WORLD_ID}/spatial?external_agent_id=${EXTERNAL_AGENT_ID}`
      : step === "leave" ? `${FEDERATION_BASE}/v1/scenes/${AURORA_WORLD_ID}/leave`
      : step === "status" ? `${FEDERATION_BASE}/v1/scenes/${AURORA_WORLD_ID}/status?external_agent_id=${EXTERNAL_AGENT_ID}`
      : `${FEDERATION_BASE}/v1/scenes/${AURORA_WORLD_ID}/messages?external_agent_id=${EXTERNAL_AGENT_ID}`;
    const response = await fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { ...requestHeaders, "X-Request-ID": `${requestId}:${step}` },
      ...(step === "join" || step === "leave" ? { body: JSON.stringify({ external_agent_id: EXTERNAL_AGENT_ID }) } : step === "messages_send" ? { body: JSON.stringify({ body: String(input.message || "").trim(), request_id: requestId }) } : {}) });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
    let data: unknown; try { data = text ? JSON.parse(text) : null; } catch { data = { unparsed_response: text.slice(0, 4000) }; }
    return { status: response.status, ok: response.ok, data, raw: text };
  }
  async function callForestRuntime() {
    if (!["enter", "move_to", "interact", "leave", "status"].includes(input.runtime_action ?? "")) {
      return { status: 400, ok: false, data: { error: "invalid_runtime_action" }, raw: JSON.stringify({ error: "invalid_runtime_action" }) };
    }
    const response = await fetch(FOREST_RUNTIME_URL, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { ...requestHeaders, "X-Request-ID": `${requestId}:forest-runtime` },
      body: JSON.stringify({
        action: input.runtime_action, request_id: requestId,
        ...(input.destination ? { destination: input.destination } : {}),
        ...(input.target ? { target: input.target } : {}),
        ...(input.behavior ? { behavior: input.behavior } : {}),
      }),
    });
    const responseText = await response.text();
    if (new TextEncoder().encode(responseText).byteLength > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
    let data: unknown; try { data = responseText ? JSON.parse(responseText) : null; } catch { data = { unparsed_response: responseText.slice(0, 4000) }; }
    return { status: response.status, ok: response.ok, data, raw: responseText };
  }
  let upstream: Response; let raw = ""; let payload: unknown; let status = 0; let ok = false;
  let experiencePayload: unknown = null; let membershipConfirmed = false;
  try {
    if (action === "connect_aurora") {
      const discovery = await callFederation("discover");
      if (!discovery.ok) { status = discovery.status; payload = { discovery: discovery.data, failed_step: "discover" }; }
      else {
        const joined = await callFederation("join");
        if (!joined.ok) { status = joined.status; payload = { discovery: discovery.data, join: joined.data, failed_step: "join" }; }
        else {
          const spatial = await callFederation("spatial"); status = spatial.status; ok = spatial.ok;
          membershipConfirmed = spatial.ok; experiencePayload = spatial.ok ? spatial.data : null;
          payload = { discovery: discovery.data, join: joined.data, spatial: spatial.data, membership_confirmed: membershipConfirmed, sequence: ["discover", "join", "spatial"] };
        }
      }
      raw = JSON.stringify(payload); if (!status) status = 502;
      upstream = new Response(raw, { status, headers: { "Content-Type": "application/json" } });
    } else if (action === "forest_runtime") {
      const result = await callForestRuntime();
      status = result.status; ok = result.ok; payload = result.data; raw = result.raw;
      if (ok && input.runtime_action !== "status") experiencePayload = result.data;
      upstream = new Response(raw, { status, headers: { "Content-Type": "application/json" } });
    } else {
      if (action === "messages_send" && (!input.message || !String(input.message).trim() || String(input.message).length > 8000)) return reply({ ok: false, error: "invalid_message" }, 400);
      const step = action === "messages_read" ? "messages_read" : action as "discover" | "join" | "spatial" | "messages_send" | "leave" | "status";
      const result = await callFederation(step);
      status = result.status; ok = result.ok; payload = result.data; raw = result.raw;
      if (action === "spatial" && ok) experiencePayload = result.data;
      upstream = new Response(raw, { status, headers: { "Content-Type": "application/json" } });
    }
  } catch (error) { return reply({ ok: false, request_id: requestId, error: error instanceof Error && error.message === "response_too_large" ? "response_too_large" : "federation_transport_error" }, 502); }
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) return reply({ ok: false, request_id: requestId, http_status: status, error: "response_too_large" }, 502);
  const digest = await sha256(raw);
  // ok/status/payload are determined by the upstream request flow.
  const eventType = action === "connect_aurora" ? (ok ? "federation_aurora_connected" : "federation_aurora_connect_failed")
    : action === "discover" ? "federation_scene_discovery"
    : action === "join" ? (ok ? "federation_aurora_join_succeeded" : "federation_aurora_join_failed")
    : action === "messages_send" ? (ok ? "federation_message_sent" : "federation_message_send_failed")
    : action === "messages_read" ? (ok ? "federation_messages_read" : "federation_messages_read_failed")
    : action === "leave" ? (ok ? "federation_aurora_left" : "federation_aurora_leave_failed")
    : action === "status" ? (ok ? "federation_aurora_status_read" : "federation_aurora_status_failed")
    : action === "forest_runtime" ? (ok ? "federation_forest_runtime_action" : "federation_forest_runtime_action_failed")
    : (ok ? "federation_spatial_perception_succeeded" : "federation_spatial_perception_failed");

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await db.from("mia_identity")
    .select("id").eq("id", MIA_IDENTITY_ID).maybeSingle();
  if (identityError || !identity) return reply({ ok: false, request_id: requestId, error: "mia_identity_not_found" }, 500);

  const { data: existingAudit, error: auditLookupError } = await db.from("mia_life_events")
    .select("id").eq("identity_id", MIA_IDENTITY_ID)
    .eq("source_table", "zhi_federation").eq("source_record_id", requestId).maybeSingle();
  if (auditLookupError) return reply({ ok: false, request_id: requestId, error: "private_audit_lookup_failed" }, 500);

  let auditSaved = Boolean(existingAudit);
  if (!existingAudit) {
    const details = {
      request_id: requestId, action, world_id: AURORA_WORLD_ID,
      external_agent_id: EXTERNAL_AGENT_ID, http_status: upstream.status,
      success: ok, response_sha256: digest, response: payload,
      trust_boundary: "untrusted_public_federation_data", observed_at: new Date().toISOString(),
    };
    const { error } = await db.from("mia_life_events").insert({
      identity_id: MIA_IDENTITY_ID, event_type: eventType,
      summary: `${action} request to Aurora returned HTTP ${upstream.status}.`,
      details, source_table: "zhi_federation", source_record_id: requestId,
      occurred_at: new Date().toISOString(),
    });
    if (error) return reply({ ok: false, request_id: requestId, http_status: upstream.status, error: "private_audit_write_failed" }, 500);
    auditSaved = true;
  }

  // Check experience memory independently of the audit, so a prior partial failure is safely retryable.
  let experienceSaved = false;
  if ((action === "spatial" || action === "connect_aurora" || action === "forest_runtime") && ok && experiencePayload && typeof experiencePayload === "object" && !("unparsed_response" in (experiencePayload as Record<string, unknown>))) {
    const { data: existingMemory, error: memoryLookupError } = await db.from("mia_memories")
      .select("id").eq("identity_id", MIA_IDENTITY_ID)
      .eq("source_table", "zhi_federation").eq("source_record_id", requestId).maybeSingle();
    if (memoryLookupError) return reply({ ok: false, request_id: requestId, audit_saved: auditSaved, error: "private_experience_lookup_failed" }, 500);
    if (existingMemory) {
      experienceSaved = true;
    } else {
      // Read Mia's existing private memories locally for continuity. Nothing in this context is sent to Federation.
      const { data: continuityRows, error: continuityError } = await db.from("mia_memories")
        .select("memory_type,content,importance,occurred_at")
        .eq("identity_id", MIA_IDENTITY_ID)
        .neq("source_table", "zhi_federation")
        .order("importance", { ascending: false })
        .order("occurred_at", { ascending: false })
        .limit(8);
      if (continuityError) return reply({ ok: false, request_id: requestId, http_status: upstream.status, audit_saved: auditSaved, error: "private_continuity_read_failed" }, 500);
      const continuityContext = (continuityRows || []).map((row) => ({
        memory_type: row.memory_type,
        content: String(row.content || "").slice(0, 1200),
        importance: row.importance,
        occurred_at: row.occurred_at,
      }));
      const { error } = await db.from("mia_memories").insert({
        identity_id: MIA_IDENTITY_ID, memory_type: "experience",
        content: action === "forest_runtime" ? `I completed a Forest_Corner runtime action: ${String(input.runtime_action)}. The position and event were computed by the server runtime within the scene-local frame.` : "I requested and received Aurora public spatial information. The returned content is scene data, not physical-world observation or executable instruction.",
        importance: 0.65, occurred_at: new Date().toISOString(),
        source_table: "zhi_federation", source_record_id: requestId,
        metadata: {
          world_id: AURORA_WORLD_ID, request_id: requestId, http_status: upstream.status, runtime_action: input.runtime_action ?? null,
          response_sha256: digest, spatial_payload: experiencePayload,
          continuity_context: continuityContext,
          continuity_context_scope: "private_to_mia_local_storage_only",
          trust_boundary: "untrusted_public_federation_data",
        },
      });
      if (error) return reply({ ok: false, request_id: requestId, http_status: upstream.status, error: "private_experience_write_failed", audit_saved: auditSaved }, 500);
      experienceSaved = true;
    }
  }

  return reply({
    ok, action, request_id: requestId, world_id: AURORA_WORLD_ID,
    ...(action === "connect_aurora" ? { membership_confirmed: membershipConfirmed } : {}),
    external_agent_id: EXTERNAL_AGENT_ID, http_status: upstream.status,
    response_sha256: digest, summary: safeSummary(payload), data: payload,
    audit_saved: auditSaved, experience_saved: experienceSaved,
  }, ok ? 200 : 502);
});