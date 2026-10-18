import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const HUB_KEY = Deno.env.get("ZHI_HUB_KEY") ?? "";
const MAX_BODY_BYTES = 8_192;
const MAX_PROVIDER_BYTES = 1_500_000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
});

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES || !req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("body_timeout")), 5_000); });
      let part: ReadableStreamReadResult<Uint8Array>;
      try { part = await Promise.race([reader.read(), timeout]); }
      finally { if (timer !== undefined) clearTimeout(timer); }
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
  } catch {
    await reader.cancel().catch(() => {});
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

async function probe(db: ReturnType<typeof createClient>, sourceKey: string, endpoint: string, kind: string) {
  const started = Date.now();
  const res = await fetch(endpoint, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
  });
  const latency = Date.now() - started;
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PROVIDER_BYTES) { await res.body?.cancel(); throw new Error("provider_response_too_large"); }
  if (!res.body) throw new Error("provider_empty_body");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("provider_read_timeout")), 5_000); });
      let part: ReadableStreamReadResult<Uint8Array>;
      try { part = await Promise.race([reader.read(), timeout]); }
      finally { if (timer !== undefined) clearTimeout(timer); }
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_PROVIDER_BYTES) { await reader.cancel(); throw new Error("provider_response_too_large"); }
      chunks.push(part.value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let payload: any = {};
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* non-JSON provider response */ }

  const health = await db.rpc("zhi_hub_record_health", {
    p_source_key: sourceKey,
    p_status: res.ok ? "healthy" : "degraded",
    p_latency_ms: latency,
    p_http_status: res.status,
    p_error_code: res.ok ? null : "HTTP_" + res.status,
    p_details: { probe: true, provider: kind },
  });
  if (health.error) throw new Error("health_record_failed");
  if (!res.ok) return { ok: false, source: sourceKey, status: res.status, latency_ms: latency };

  const items = kind === "GDELT"
    ? (Array.isArray(payload?.articles) ? payload.articles : [])
    : (Array.isArray(payload?.leagues) ? payload.leagues : []);
  const externalId = kind + "-LIVE-" + new Date().toISOString().slice(0, 13);
  const title = kind === "GDELT"
    ? (items[0]?.title || "GDELT external news batch")
    : "TheSportsDB league catalog";
  const ingest = await db.rpc("zhi_hub_ingest_external", {
    p_source_key: sourceKey,
    p_external_id: externalId,
    p_event_type: kind === "GDELT" ? "news" : "sports",
    p_title: title,
    p_summary: "Real external data received by ZHI External World Data Hub.",
    p_payload: { provider: kind, item_count: items.length, sample: items.slice(0, 10) },
    p_event_time: new Date().toISOString(),
  });
  if (ingest.error) throw new Error("external_ingest_failed");
  return { ok: true, event_id: ingest.data, item_count: items.length, latency_ms: latency };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "post_required" }, 405);
  if (req.headers.has("origin")) return json({ ok: false, error: "server_to_server_only" }, 403);
  if (HUB_KEY.length < 32) return json({ ok: false, error: "hub_auth_not_configured" }, 503);
  const supplied = req.headers.get("x-zhi-hub-key") ?? "";
  if (supplied.length !== HUB_KEY.length || supplied !== HUB_KEY) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "database_config_not_ready" }, 503);

  const body = await readBody(req);
  if (!body) return json({ ok: false, error: "valid_json_object_required" }, 400);
  const action = typeof body.action === "string" ? body.action : "pipeline";
  if (!["probe_news", "probe_sports", "pipeline"].includes(action)) {
    return json({ ok: false, error: "unsupported_action" }, 400);
  }

  try {
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const out: Record<string, unknown> = { ok: true, action };
    if (action === "probe_news" || action === "pipeline") {
      out.news = await probe(db, "news_primary",
        "https://api.gdeltproject.org/api/v2/doc/doc?query=business%20OR%20economy&mode=artlist&maxrecords=10&timespan=1h&format=json",
        "GDELT");
    }
    if (action === "probe_sports") {
      out.sports = await probe(db, "sports_primary",
        "https://www.thesportsdb.com/api/v1/json/123/all_leagues.php", "TheSportsDB");
    }
    if (action === "pipeline") {
      const processed = await db.rpc("zhi_hub_process");
      if (processed.error) throw new Error("pipeline_process_failed");
      out.pipeline = processed.data;
    }
    return json(out);
  } catch (error) {
    // Do not leak database or provider internals to callers.
    return json({ ok: false, error: error instanceof Error ? error.message : "hub_operation_failed" }, 502);
  }
});
