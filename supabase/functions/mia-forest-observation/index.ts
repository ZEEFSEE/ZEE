import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MIA_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function validateMiaToken(token: string): Promise<boolean> {
  if (!SERVICE_KEY || !token || token.length > 4096) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(SERVICE_KEY),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    if (!await crypto.subtle.verify(
      "HMAC", key, decodeBase64Url(parts[1]), new TextEncoder().encode(parts[0]),
    )) return false;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return payload?.aud === "mia-chat" &&
      payload?.sub === "mia-admin" &&
      Number.isFinite(payload?.exp) && payload.exp > now &&
      Number.isFinite(payload?.iat) && payload.iat <= now + 60;
  } catch {
    return false;
  }
}

export function projectObservation(row: any) {
  const state = row?.after_state;
  if (!state || state.scene_id !== "mia-forest-corner") {
    throw new Error("Latest autonomy state is not the prototype Mia Forest Corner state");
  }
  const position = state.current_position && {
    x: Number.isFinite(state.current_position.x) ? state.current_position.x : null,
    y: Number.isFinite(state.current_position.y) ? state.current_position.y : null,
    z: Number.isFinite(state.current_position.z) ? state.current_position.z : null,
    frame: String(state.current_position.frame || "unknown"),
  };
  return {
    schema: "zhi.mia.headless-scene-state.v1",
    subject: "prototype-mia",
    identity_id: MIA_ID,
    generated_at: row.created_at,
    scene: {
      id: state.scene_id,
      runtime_instance: String(row.details?.runtime_instance_id || state.runtime_instance_id || "unknown"),
      coordinate_space: String(state.coordinate_space || "unknown"),
      coordinate_frame: String(state.coordinate_frame || "unknown"),
      calibration_status: String(state.world_transform_status || "unknown"),
    },
    autonomy: {
      run_id: row.id,
      status: row.status,
      trigger: String(row.details?.trigger || "unknown"),
      planner_mode: String(row.details?.planner_mode || "unknown"),
      action: String(row.planned_action || "unknown"),
      reason: String(row.planner_reason || "").slice(0, 500),
      sequence: Number.isFinite(state.sequence) ? state.sequence : null,
      session_status: String(state.session_status || "unknown"),
      current_node_id: String(state.current_node_id || "unknown"),
      last_action: String(state.last_action || row.planned_action || "unknown"),
      last_interaction: state.environment_state?.last_interaction || null,
    },
    position,
    provenance: {
      source: "mia_forest_autonomy_runs.after_state",
      perception_mode: "headless-semantic-state",
      live_camera_perception: false,
      physical_3d_movement: false,
      may_drive_movement: false,
      read_only: true,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
  if (!URL || !SERVICE_KEY) return json({ ok: false, error: "Observation service is not configured" }, 503);
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!await validateMiaToken(token)) return json({ ok: false, error: "Mia session expired; please sign in again." }, 401);

  const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("mia_forest_autonomy_runs")
    .select("id,identity_id,status,planned_action,planner_reason,after_state,details,created_at")
    .eq("identity_id", MIA_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Mia observation read failed", error.code || "database_error");
    return json({ ok: false, error: "Scene observation is temporarily unavailable." }, 503);
  }
  if (!data) return json({ ok: false, error: "No autonomy state is available yet." }, 404);
  try {
    return json({ ok: true, observation: projectObservation(data) });
  } catch (error) {
    console.error("Mia observation projection rejected state", error instanceof Error ? error.message : "unknown");
    return json({ ok: false, error: "Latest state is outside the prototype Mia Forest Corner contract." }, 409);
  }
});
