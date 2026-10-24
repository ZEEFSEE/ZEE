import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GH_TOKEN = Deno.env.get("GITHUB_SCENE_TOKEN") || "";
const GH_API = "https://api.github.com";
const REPO = "ZEEFSEE/ZEE";
const BRANCH = "main";
const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = {
  "Access-Control-Allow-Origin": "https://zeefsee.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
function decode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function validMiaSession(token: string): Promise<boolean> {
  try {
    if (!SERVICE_KEY) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, decode(parts[1]), new TextEncoder().encode(parts[0]))) return false;
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return claims.aud === "mia-chat" && claims.sub === "mia-admin" &&
      Number.isFinite(claims.exp) && claims.exp > now &&
      Number.isFinite(claims.iat) && claims.iat <= now + 60;
  } catch { return false; }
}
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(binary);
}
async function github(path: string, init: RequestInit = {}) {
  return await fetch(GH_API + path, {
    ...init,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + GH_TOKEN,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== "https://zeefsee.github.io") return json({ ok: false, error: "origin_not_allowed" }, 403);
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || !await validMiaSession(auth.slice(7))) {
    return json({ ok: false, error: "mia_session_required" }, 401);
  }
  if (!GH_TOKEN) return json({ ok: false, error: "github_scene_token_not_configured" }, 503);
  const length = Number(req.headers.get("content-length") || "0");
  if (length > 30000) return json({ ok: false, error: "request_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 30000) return json({ ok: false, error: "request_too_large" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || !isObject(parsed.scene)) return json({ ok: false, error: "scene_object_required" }, 400);
    body = parsed;
  } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const scene = body.scene as Record<string, unknown>;
  const id = scene.scene_id;
  const name = scene.display_name;
  const parent = scene.parent_scene_id;
  const description = scene.description;
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80) return json({ ok: false, error: "invalid_scene_id" }, 400);
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) return json({ ok: false, error: "invalid_display_name" }, 400);
  if (typeof parent !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parent)) return json({ ok: false, error: "invalid_parent_scene_id" }, 400);
  if (typeof description !== "string" || !description.trim() || description.trim().length > 3000) return json({ ok: false, error: "invalid_description" }, 400);
  const manifestResponse = await fetch("https://zeefsee.github.io/ZEE/world-scenes/world-manifest.json", {
    headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(7000),
  }).catch(() => null);
  if (!manifestResponse?.ok) return json({ ok: false, error: "scene_manifest_unavailable" }, 503);
  const manifest: unknown = await manifestResponse.json().catch(() => null);
  if (!isObject(manifest) || !Array.isArray(manifest.scenes)) return json({ ok: false, error: "scene_manifest_invalid" }, 503);
  const entries = manifest.scenes.filter(isObject);
  const ids = new Set(entries.map((x) => x.scene_id).filter((x): x is string => typeof x === "string"));
  if (!ids.has(parent)) return json({ ok: false, error: "parent_scene_not_registered" }, 409);
  if (ids.has(id)) return json({ ok: false, error: "duplicate_scene_id" }, 409);
  const path = "/repos/" + REPO + "/contents/world-scenes/inbox/" + id + ".json";
  const existing = await github(path + "?ref=" + BRANCH);
  if (existing.status === 200) return json({ ok: false, error: "scene_inbox_file_exists" }, 409);
  if (existing.status !== 404) return json({ ok: false, error: "github_preflight_failed", status: existing.status }, 502);
  const normalized = {
    ...scene,
    schema_version: typeof scene.schema_version === "string" ? scene.schema_version : "1.0.0",
    scene_id: id,
    display_name: name.trim(),
    parent_scene_id: parent,
    description: description.trim(),
    source_reference: { kind: "mia_authored_scene", created_by: "Mia", created_at: new Date().toISOString() },
    verification_status: "scene-page-generated; geometry-and-runtime-unverified",
    status: "integrated",
  };
  const created = await github(path, {
    method: "PUT",
    body: JSON.stringify({
      message: "Submit Mia-authored scene: " + id,
      branch: BRANCH,
      content: b64(JSON.stringify(normalized, null, 2) + "\n"),
    }),
  });
  const result = await created.json().catch(() => ({}));
  if (!created.ok) return json({ ok: false, error: "github_scene_submit_failed", status: created.status,
    detail: created.status === 401 || created.status === 403 ? "Check GITHUB_SCENE_TOKEN repository Contents write permission." : undefined }, 502);
  return json({
    ok: true,
    scene_id: id,
    inbox_path: "world-scenes/inbox/" + id + ".json",
    commit_sha: result.commit?.sha || null,
    workflow_triggered_by_push: true,
    message: "Scene file accepted. GitHub Actions will generate the scene page, register the manifest entry, and refresh the scene index.",
    production_world_write: false,
    database_write: false,
  }, 201);
});
