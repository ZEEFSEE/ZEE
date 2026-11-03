import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { initialState, transition, sceneSnapshot, SCENE_ID, WORLD_ID, RUNTIME_ID } from "./forest-corner-engine.mjs";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MIA_PEER_ID = "dedf7805-df3d-4437-bb1f-3c4c7a32aa7f";
const EXTERNAL_AGENT_ID = "mia";
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "POST,OPTIONS",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const sha256 = async (value: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  if (!URL || !SERVICE_KEY) return respond({ ok: false, error: "server_configuration_missing" }, 503);

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer || bearer.length < 40 || bearer.length > 4096) return respond({ ok: false, error: "invalid_token" }, 401);

  let body: any;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 16_384) return respond({ ok: false, error: "payload_too_large" }, 413);
    body = JSON.parse(raw);
  } catch { return respond({ ok: false, error: "invalid_json" }, 400); }

  const action = String(body.action ?? "");
  const requestId = String(body.request_id ?? "");
  if (!/^[a-zA-Z0-9._:-]{8,120}$/.test(requestId)) return respond({ ok: false, error: "invalid_request_id" }, 400);
  if (!["enter", "move_to", "interact", "leave", "status"].includes(action)) return respond({ ok: false, error: "unsupported_action" }, 400);

  const db = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: peer, error: peerError } = await db.from("zhi_federation_peers")
    .select("id,capabilities,expires_at,revoked_at")
    .eq("token_hash", await sha256(bearer)).maybeSingle();
  if (peerError || !peer || peer.id !== MIA_PEER_ID || peer.revoked_at ||
      (peer.expires_at && Date.parse(peer.expires_at) <= Date.now())) {
    return respond({ ok: false, error: "invalid_or_unapproved_peer" }, 401);
  }
  if (!Array.isArray(peer.capabilities) || !peer.capabilities.includes("spatial:anchor.publish")) {
    return respond({ ok: false, error: "missing_capability" }, 403);
  }

  const { data: membership, error: membershipError } = await db.from("zhi_federation_memberships")
    .select("id,status,revoked_at")
    .eq("world_id", WORLD_ID).eq("peer_id", peer.id)
    .eq("external_agent_id", EXTERNAL_AGENT_ID).eq("status", "active")
    .is("revoked_at", null).maybeSingle();
  if (membershipError || !membership) return respond({ ok: false, error: "active_scene_membership_required" }, 403);

  const { data: world, error: worldError } = await db.from("zhi_worlds")
    .select("id,status,visibility,entry_policy").eq("id", WORLD_ID).maybeSingle();
  if (worldError || !world || world.status !== "open") return respond({ ok: false, error: "world_unavailable" }, 409);

  const { data: current, error: stateError } = await db.from("zhi_forest_runtime_state")
    .select("*").eq("world_id", WORLD_ID).eq("peer_id", peer.id)
    .eq("external_agent_id", EXTERNAL_AGENT_ID).eq("scene_id", SCENE_ID).maybeSingle();
  if (stateError) return respond({ ok: false, error: "runtime_state_read_failed" }, 503);

  const currentState = current ? {
    scene_id: current.scene_id,
    coordinate_frame: current.coordinate_frame,
    runtime_instance_id: current.runtime_instance_id,
    current_node_id: current.current_node_id,
    current_position: current.current_position,
    sequence: Number(current.sequence),
    session_status: current.session_status,
    position_status: current.position_status,
    environment_state: current.environment_state,
  } : initialState();

  if (action === "status") return respond({ ok: true, snapshot: sceneSnapshot(currentState) });

  let result;
  try { result = transition(currentState, action, body); }
  catch (error) {
    const code = error instanceof Error ? error.message : "runtime_transition_failed";
    const status = code === "already_inside_scene" || code === "already_at_destination" ? 409 :
      code === "scene_not_active" || code === "target_out_of_reach" ? 409 :
      code === "destination_not_registered" || code === "target_not_registered_for_interaction" ||
      code === "interaction_not_supported" ? 400 : 422;
    return respond({ ok: false, error: code }, status);
  }

  const { data: committed, error: commitError } = await db.rpc("zhi_forest_runtime_commit_action", {
    p_world_id: WORLD_ID,
    p_peer_id: peer.id,
    p_external_agent_id: EXTERNAL_AGENT_ID,
    p_membership_id: membership.id,
    p_scene_id: SCENE_ID,
    p_runtime_instance_id: RUNTIME_ID,
    p_coordinate_frame: "forest-corner-local-v1",
    p_request_id: requestId,
    p_expected_sequence: Number(current?.sequence ?? 0),
    p_events: result.events,
    p_next_state: result.state,
  });
  if (commitError) {
    const conflict = String(commitError.message ?? "").includes("runtime_sequence_conflict");
    return respond({ ok: false, error: conflict ? "runtime_sequence_conflict" : "runtime_commit_failed" }, conflict ? 409 : 503);
  }

  return respond({
    ok: true,
    replayed: committed?.replayed === true,
    action,
    committed,
    snapshot: sceneSnapshot(result.state),
    events: result.events,
    private_memory_written: false,
  });
});
