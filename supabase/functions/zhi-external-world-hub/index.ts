import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const projectUrl = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const db = createClient(
  projectUrl,
  secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const HUB_KEY = Deno.env.get("ZHI_HUB_KEY") || "";
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 10_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
    h.endsWith(".internal") || h.endsWith(".test") || h.endsWith(".invalid")
  ) return true;
  // Do not accept IP literals. Restricting to configured hostnames avoids direct
  // requests to loopback, link-local, private, or cloud metadata IP addresses.
  if (/^[0-9.]+$/.test(h) || h.includes(":")) return true;
  return false;
}

function hostAllowed(host: string): boolean {
  const configured = (Deno.env.get("ZHI_HUB_ALLOWED_HOSTS") || "")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const h = host.toLowerCase();
  return configured.some((domain) => h === domain || h.endsWith("." + domain));
}

function stripHtml(input: string): string {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function readPublicUrl(rawUrl: unknown) {
  if (typeof rawUrl !== "string" || rawUrl.length > 2048) {
    return { response: json({ ok: false, error: "url_required_or_too_long" }, 400) };
  }
  let target: URL;
  try { target = new URL(rawUrl); } catch {
    return { response: json({ ok: false, error: "invalid_url" }, 400) };
  }
  if (target.protocol !== "https:" || target.username || target.password || isBlockedHost(target.hostname)) {
    return { response: json({ ok: false, error: "https_public_hostname_required" }, 400) };
  }
  if (!hostAllowed(target.hostname)) {
    return { response: json({ ok: false, error: "host_not_allowlisted", required_config: "ZHI_HUB_ALLOWED_HOSTS" }, 403) };
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(target.toString(), {
      method: "GET",
      redirect: "manual",
      headers: { "accept": "text/html,text/plain,application/json,application/xml;q=0.8,*/*;q=0.2", "user-agent": "ZHI-External-World-Hub/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { response: json({ ok: false, error: "upstream_fetch_failed" }, 502) };
  }
  // Do not follow redirects: each redirect would need an independent policy check.
  if (response.status >= 300 && response.status < 400) {
    return { response: json({ ok: false, error: "redirect_not_followed" }, 422) };
  }
  if (!response.ok) {
    return { response: json({ ok: false, error: "upstream_http_error", upstream_status: response.status }, 502) };
  }
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (!/(text\/html|text\/plain|application\/json|application\/xml|text\/xml)/.test(type)) {
    return { response: json({ ok: false, error: "unsupported_content_type" }, 415) };
  }
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_BYTES) {
    return { response: json({ ok: false, error: "response_too_large" }, 413) };
  }
  if (!response.body) {
    return { response: json({ ok: false, error: "empty_response" }, 502) };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return { response: json({ ok: false, error: "response_too_large" }, 413) };
      }
      chunks.push(value);
    }
  } catch {
    return { response: json({ ok: false, error: "response_read_failed" }, 502) };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  let content: unknown;
  if (type.includes("application/json")) {
    try { content = JSON.parse(raw); } catch { content = raw; }
  } else {
    content = type.includes("html") ? stripHtml(raw) : raw;
  }
  return {
    data: {
      ok: true,
      source_url: target.toString(),
      fetched_at: new Date().toISOString(),
      http_status: response.status,
      content_type: type,
      latency_ms: Date.now() - started,
      content,
    },
  };
}

async function probe(sourceKey: string, endpoint: string, kind: string) {
  const started = Date.now();
  const res = await fetch(endpoint, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  const latency = Date.now() - started;
  const raw = await res.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { /* keep empty payload */ }
  await db.rpc("zhi_hub_record_health", {
    p_source_key: sourceKey,
    p_status: res.ok ? "healthy" : "degraded",
    p_latency_ms: latency,
    p_http_status: res.status,
    p_error_code: res.ok ? null : "HTTP_" + res.status,
    p_details: { probe: true, provider: kind },
  });
  if (!res.ok) return { ok: false, source: sourceKey, status: res.status, latency_ms: latency };
  const items = kind === "GDELT"
    ? (Array.isArray(payload?.articles) ? payload.articles : [])
    : (Array.isArray(payload?.leagues) ? payload.leagues : []);
  const externalId = kind + "-LIVE-" + new Date().toISOString().slice(0, 13);
  const title = kind === "GDELT" ? (items[0]?.title || "GDELT external news batch") : "TheSportsDB league catalog";
  const eventId = (await db.rpc("zhi_hub_ingest_external", {
    p_source_key: sourceKey,
    p_external_id: externalId,
    p_event_type: kind === "GDELT" ? "news" : "sports",
    p_title: title,
    p_summary: "Real external data received by ZHI External World Data Hub.",
    p_payload: { provider: kind, item_count: items.length, sample: items.slice(0, 10) },
    p_event_time: new Date().toISOString(),
  })).data;
  return { ok: true, event_id: eventId, item_count: items.length, latency_ms: latency };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "post_required" }, 405);
  if (!HUB_KEY) return json({ ok: false, error: "hub_auth_not_configured" }, 503);
  if (req.headers.get("x-zhi-hub-key") !== HUB_KEY) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "pipeline";
    if (action === "read_url") {
      const result = await readPublicUrl(body.url);
      if (result.response) return result.response;
      return json(result.data);
    }
    const out: Record<string, unknown> = { ok: true, action };
    if (action === "probe_news" || action === "pipeline") {
      out.news = await probe(
        "news_primary",
        "https://api.gdeltproject.org/api/v2/doc/doc?query=business%20OR%20economy&mode=artlist&maxrecords=10&timespan=1h&format=json",
        "GDELT",
      );
    }
    if (action === "probe_sports") {
      out.sports = await probe("sports_primary", "https://www.thesportsdb.com/api/v1/json/123/all_leagues.php", "TheSportsDB");
    }
    if (action === "pipeline") out.pipeline = (await db.rpc("zhi_hub_process")).data;
    return json(out);
  } catch (error) {
    return json({ ok: false, error: String((error as Error)?.message ?? error) }, 500);
  }
});
