import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://zeefsee.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return response({ ok: false, error: "method_not_allowed" }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== "https://zeefsee.github.io") return response({ ok: false, error: "origin_not_allowed" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization");
  if (!url || !anonKey || !serviceKey) return response({ ok: false, error: "server_configuration_incomplete" }, 503);
  if (!authHeader?.startsWith("Bearer ")) return response({ ok: false, error: "authentication_required" }, 401);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ ok: false, error: "invalid_session" }, 401);
  const adminMeta = userData.user.app_metadata ?? {};
  const canOperate = adminMeta.role === "admin" || adminMeta.world_builder_admin === true;
  if (req.method === "POST" && !canOperate) return response({ ok: false, error: "operator_role_required" }, 403);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (req.method === "GET") {
    const [{ data: config, error: configError }, { data: regions, error: regionError }] = await Promise.all([
      db.from("zhi_world_builder_config").select("*").eq("config_key", "default").maybeSingle(),
      db.from("zhi_world_builder_region_health").select("region_key,sample_count,error_count,error_rate,frozen,freeze_reason,last_sample_at,updated_at").order("region_key"),
    ]);
    if (configError || regionError || !config) return response({ ok: false, error: "world_builder_state_unavailable" }, 503);
    return response({
      ok: true, service: "zhi-world-builder", mode: config.sandbox_mode ? "sandbox" : "restricted",
      paused: config.global_paused, aigc_enabled: config.aigc_enabled,
      production_writes_enabled: config.production_writes_enabled,
      aesthetic_profile: { version: config.profile_version, gold_consensus: Number(config.gold_consensus), yellow_vitality: Number(config.yellow_vitality), green_spontaneity: Number(config.green_spontaneity) },
      regions: regions ?? [],
      capabilities: { record_validation: true, submit_sandbox_proposal: true, propose_scene: false, aigc_generation: false, production_write: false, real_token_movement: false },
    });
  }

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > 20000) return response({ ok: false, error: "request_body_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 20000) return response({ ok: false, error: "request_body_too_large" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return response({ ok: false, error: "json_object_required" }, 400);
    body = parsed;
  } catch { return response({ ok: false, error: "invalid_json" }, 400); }

  if (body.action === "update_palette") {
    const values = [body.gold_consensus, body.yellow_vitality, body.green_spontaneity];
    if (!values.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)) return response({ ok: false, error: "palette_values_must_be_between_0_and_1" }, 400);
    const total = (values as number[]).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.0001) return response({ ok: false, error: "palette_must_sum_to_1" }, 400);
    const { data, error } = await db.from("zhi_world_builder_config").update({
      gold_consensus: values[0], yellow_vitality: values[1], green_spontaneity: values[2],
      updated_at: new Date().toISOString(), updated_by: userData.user.id,
    }).eq("config_key", "default").select("config_key,gold_consensus,yellow_vitality,green_spontaneity,profile_version,updated_at,updated_by").single();
    if (error) return response({ ok: false, error: "palette_update_failed" }, 503);
    return response({ ok: true, aesthetic_profile: data });
  }

  if (body.action === "record_validation") {
    const sampleId = body.sample_id, regionKey = body.region_key, passed = body.passed;
    if (typeof sampleId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sampleId)) return response({ ok: false, error: "sample_id_must_be_uuid" }, 400);
    if (typeof regionKey !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/.test(regionKey.trim())) return response({ ok: false, error: "invalid_region_key" }, 400);
    if (typeof passed !== "boolean") return response({ ok: false, error: "passed_must_be_boolean" }, 400);
    const details = isRecord(body.details) ? body.details : {};
    const { data, error } = await db.rpc("zhi_world_builder_record_sample", {
      p_sample_id: sampleId, p_region_key: regionKey.trim(), p_passed: passed,
      p_validation_code: typeof body.validation_code === "string" ? body.validation_code.slice(0, 80) : "scene_validation",
      p_details: details, p_recorded_by: userData.user.id,
    });
    if (error) return response({ ok: false, error: "stability_record_failed" }, 503);
    return response({ ok: true, oracle: data });
  }

  if (body.action === "submit_sandbox_proposal") {
    const regionKey = body.region_key, title = body.title, proposal = body.proposal;
    if (typeof regionKey !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/.test(regionKey.trim())) return response({ ok: false, error: "invalid_region_key" }, 400);
    if (typeof title !== "string" || !title.trim() || title.trim().length > 160) return response({ ok: false, error: "title_required_max_160_chars" }, 400);
    if (!isRecord(proposal)) return response({ ok: false, error: "proposal_must_be_json_object" }, 400);
    if (new TextEncoder().encode(JSON.stringify(proposal)).length > 12000) return response({ ok: false, error: "proposal_payload_too_large" }, 413);

    const { data: config, error: configError } = await db.from("zhi_world_builder_config")
      .select("gold_consensus,yellow_vitality,green_spontaneity,profile_version,sandbox_mode,aigc_enabled,production_writes_enabled,global_paused")
      .eq("config_key", "default").single();
    if (configError || !config) return response({ ok: false, error: "world_builder_state_unavailable" }, 503);
    if (config.global_paused) return response({ ok: false, error: "world_builder_paused" }, 423);
    if (!config.sandbox_mode || config.production_writes_enabled) return response({ ok: false, error: "sandbox_only_mode_required" }, 423);

    const normalizedRegion = regionKey.trim();
    const { data: region, error: regionError } = await db.from("zhi_world_builder_region_health")
      .select("frozen,freeze_reason,sample_count,error_rate").eq("region_key", normalizedRegion).maybeSingle();
    if (regionError) return response({ ok: false, error: "region_health_unavailable" }, 503);
    if (region?.frozen) return response({ ok: false, error: "region_frozen", freeze_reason: region.freeze_reason ?? null }, 423);

    const { data, error } = await db.from("zhi_world_builder_proposals").insert({
      region_key: normalizedRegion, proposal_type: "scene", title: title.trim(), proposal,
      aesthetic_snapshot: { profile_version: config.profile_version, gold_consensus: Number(config.gold_consensus), yellow_vitality: Number(config.yellow_vitality), green_spontaneity: Number(config.green_spontaneity) },
      status: "proposed", created_by: "admin_sandbox:" + userData.user.id,
      metadata: { pipeline: "sandbox_intake_v1", aigc_generated: false, production_write: false },
    }).select("id,region_key,proposal_type,title,status,created_at,aesthetic_snapshot").single();
    if (error) return response({ ok: false, error: "sandbox_proposal_insert_failed" }, 503);
    return response({ ok: true, proposal: data, safety: { sandbox_only: true, aigc_generated: false, production_write: false, real_token_movement: false } }, 201);
  }

  if (body.action === "resume") return response({ ok: false, error: "resume_requires_review_and_is_not_enabled" }, 423);
  if (body.action === "propose_scene") return response({ ok: false, error: "aigc_generation_not_enabled" }, 423);
  return response({ ok: false, error: "unsupported_action" }, 400);
});