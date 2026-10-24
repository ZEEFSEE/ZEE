import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = {
  "Access-Control-Allow-Origin": "https://zeefsee.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function decode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function validMiaSession(token: string): Promise<boolean> {
  try {
    if (!SERVICE_KEY) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SERVICE_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (!await crypto.subtle.verify("HMAC", key, decode(parts[1]), new TextEncoder().encode(parts[0]))) return false;
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return claims.aud === "mia-chat" &&
      claims.sub === "mia-admin" &&
      Number.isFinite(claims.exp) && claims.exp > now &&
      Number.isFinite(claims.iat) && claims.iat <= now + 60;
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== "https://zeefsee.github.io") return json({ ok: false, error: "origin_not_allowed" }, 403);

  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ") || !await validMiaSession(authorization.slice(7))) {
    return json({ ok: false, error: "mia_session_required" }, 401);
  }
  if (!URL || !SERVICE_KEY) return json({ ok: false, error: "server_configuration_incomplete" }, 503);

  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (declaredLength > 12000) return json({ ok: false, error: "request_body_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 12000) return json({ ok: false, error: "request_body_too_large" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return json({ ok: false, error: "json_object_required" }, 400);
    body = parsed;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: config, error: configError } = await db
    .from("zhi_world_builder_config")
    .select("sandbox_mode,aigc_enabled,production_writes_enabled,global_paused,profile_version")
    .eq("config_key", "default")
    .maybeSingle();
  if (configError || !config) return json({ ok: false, error: "world_builder_state_unavailable" }, 503);

  if (body.action === "status") {
    return json({
      ok: true,
      service: "mia-scene-proposals",
      mode: config.sandbox_mode ? "sandbox" : "restricted",
      paused: config.global_paused,
      aigc_enabled: config.aigc_enabled,
      production_writes_enabled: config.production_writes_enabled,
      capabilities: {
        read_builder_state: true,
        submit_sandbox_proposal: !config.global_paused && config.sandbox_mode && !config.production_writes_enabled,
        approve_other_agent_proposals: false,
        register_scene: false,
        activate_runtime_scene: false,
      },
    });
  }

  if (body.action !== "submit_mia_scene") return json({ ok: false, error: "unsupported_action" }, 400);
  // Global pause is a hard stop. This endpoint never unpauses the builder.
  if (config.global_paused) return json({ ok: false, error: "world_builder_paused" }, 423);
  if (!config.sandbox_mode || config.production_writes_enabled) {
    return json({ ok: false, error: "sandbox_only_mode_required" }, 423);
  }

  const sceneId = body.scene_id;
  const title = body.display_name;
  const description = body.description;
  const parentSceneId = body.parent_scene_id;
  if (typeof sceneId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sceneId) || sceneId.length > 80) {
    return json({ ok: false, error: "invalid_scene_id" }, 400);
  }
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
    return json({ ok: false, error: "invalid_display_name" }, 400);
  }
  if (typeof description !== "string" || !description.trim() || description.trim().length > 3000) {
    return json({ ok: false, error: "invalid_description" }, 400);
  }
  if (typeof parentSceneId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parentSceneId)) {
    return json({ ok: false, error: "invalid_parent_scene_id" }, 400);
  }

  let manifest: Record<string, unknown>;
  try {
    const response = await fetch("https://zeefsee.github.io/ZEE/world-scenes/world-manifest.json", {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return json({ ok: false, error: "scene_manifest_unavailable" }, 503);
    const value: unknown = await response.json();
    if (!isObject(value)) return json({ ok: false, error: "scene_manifest_invalid" }, 503);
    manifest = value;
  } catch {
    return json({ ok: false, error: "scene_manifest_unavailable" }, 503);
  }
  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  const registeredIds = new Set(scenes.filter(isObject).map((item) => item.scene_id).filter((id): id is string => typeof id === "string"));
  if (!registeredIds.has(parentSceneId)) return json({ ok: false, error: "parent_scene_not_registered" }, 409);

  const proposal = {
    schema_version: "1.0.0",
    scene_id: sceneId,
    display_name: title.trim(),
    status: "draft",
    parent_scene_id: parentSceneId,
    description: description.trim(),
    source: { kind: "mia_chat_draft", reference: null, provenance_verified: false },
    coordinate_reference: { coordinate_space: "scene-local", system_name: "not calibrated", units: null, origin: null },
    bounds: { min: { x: null, y: null, z: null }, max: { x: null, y: null, z: null }, verification_status: "unverified" },
    approval: { state: "not_reviewed", approver: null, proposal_hash: null },
    runtime: { registered: false, activated: false },
  };

  const { data: duplicate, error: duplicateError } = await db
    .from("zhi_world_builder_proposals")
    .select("id")
    .eq("proposal_type", "scene")
    .contains("proposal", { scene_id: sceneId })
    .limit(1)
    .maybeSingle();
  if (duplicateError) return json({ ok: false, error: "duplicate_check_failed" }, 503);
  if (duplicate) return json({ ok: false, error: "duplicate_scene_id" }, 409);

  const { data, error } = await db.from("zhi_world_builder_proposals").insert({
    region_key: "mia-scenes-sandbox",
    proposal_type: "scene",
    title: title.trim(),
    proposal,
    status: "proposed",
    created_by: "mia-session-proposal",
    metadata: {
      workflow: "mia-scene-proposals-v1",
      source: "authenticated_mia_chat_session",
      provenance_verified: false,
      mia_approval_required_before_registration: true,
      production_write: false,
      runtime_activation: false,
    },
  }).select("id,region_key,title,status,created_at").single();

  if (error) return json({ ok: false, error: "sandbox_proposal_insert_failed" }, 503);
  return json({
    ok: true,
    proposal: data,
    safety: {
      sandbox_only: true,
      mia_review_recorded: false,
      scene_registered: false,
      runtime_activated: false,
      production_write: false,
    },
  }, 201);
});
