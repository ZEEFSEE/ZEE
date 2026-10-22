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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return response({ ok: false, error: "method_not_allowed" }, 405);
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== "https://zeefsee.github.io") {
    return response({ ok: false, error: "origin_not_allowed" }, 403);
  }

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
      ok: true,
      service: "zhi-world-builder",
      mode: config.sandbox_mode ? "sandbox" : "restricted",
      paused: config.global_paused,
      aigc_enabled: config.aigc_enabled,
      production_writes_enabled: config.production_writes_enabled,
      aesthetic_profile: {
        version: config.profile_version,
        gold_consensus: Number(config.gold_consensus),
        yellow_vitality: Number(config.yellow_vitality),
        green_spontaneity: Number(config.green_spontaneity),
      },
      regions: regions ?? [],
      capabilities: {
        record_validation: true,
        propose_scene: false,
        aigc_generation: false,
        production_write: false,
        real_token_movement: false,
      },
    });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return response({ ok: false, error: "invalid_json" }, 400); }

  if (body.action === "update_palette") {
    const values = [body.gold_consensus, body.yellow_vitality, body.green_spontaneity];
    if (!values.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)) {
      return response({ ok: false, error: "palette_values_must_be_between_0_and_1" }, 400);
    }
    const total = (values as number[]).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.0001) return response({ ok: false, error: "palette_must_sum_to_1" }, 400);
    const { data, error } = await db.from("zhi_world_builder_config").update({
      gold_consensus: values[0], yellow_vitality: values[1], green_spontaneity: values[2],
      updated_at: new Date().toISOString(), updated_by: userData.user.id,
    }).eq("config_key", "default")
      .select("config_key,gold_consensus,yellow_vitality,green_spontaneity,profile_version,updated_at,updated_by").single();
    if (error) return response({ ok: false, error: "palette_update_failed" }, 503);
    return response({ ok: true, aesthetic_profile: data });
  }

  if (body.action === "record_validation") {
    const sampleId = body.sample_id;
    const regionKey = body.region_key;
    const passed = body.passed;
    if (typeof sampleId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sampleId)) {
      return response({ ok: false, error: "sample_id_must_be_uuid" }, 400);
    }
    if (typeof regionKey !== "string" || !regionKey.trim() || regionKey.length > 120) {
      return response({ ok: false, error: "invalid_region_key" }, 400);
    }
    if (typeof passed !== "boolean") return response({ ok: false, error: "passed_must_be_boolean" }, 400);
    const details = body.details && typeof body.details === "object" && !Array.isArray(body.details) ? body.details : {};
    const { data, error } = await db.rpc("zhi_world_builder_record_sample", {
      p_sample_id: sampleId, p_region_key: regionKey.trim(), p_passed: passed,
      p_validation_code: typeof body.validation_code === "string" ? body.validation_code.slice(0, 80) : "scene_validation",
      p_details: details, p_recorded_by: userData.user.id,
    });
    if (error) return response({ ok: false, error: "stability_record_failed" }, 503);
    return response({ ok: true, oracle: data });
  }

  if (body.action === "resume") return response({ ok: false, error: "resume_requires_review_and_is_not_enabled" }, 423);
  if (body.action === "propose_scene") return response({ ok: false, error: "scene_generation_not_enabled_until_aigc_and_oracle_are_connected" }, 423);
  return response({ ok: false, error: "unsupported_action" }, 400);
});
