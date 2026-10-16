import { createClient } from "npm:@supabase/supabase-js@2";

const CORE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function signPayload(payload: Record<string, unknown>): Promise<string> {
  const encoded = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)));
  return encoded + "." + b64url(signature);
}

const recentFailures = new Map<string, { count: number; since: number; blockedUntil: number }>();
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!SERVICE_KEY) return json({ error: "Server authentication is not configured" }, 503);

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password || password.length > 128) return json({ error: "请输入页面访问密码。" }, 400);

  const forwarded = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(forwarded)));
  const clientKey = b64url(ipDigest);
  const now = Date.now();
  const local = recentFailures.get(clientKey);
  if (local && local.blockedUntil > now) return json({ error: "尝试次数过多，请 15 分钟后再试。" }, 429);
  if (local && now - local.since > 15 * 60 * 1000) recentFailures.delete(clientKey);

  const db = createClient(CORE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: valid, error } = await db.rpc("zhi_verify_chat_password", { p_password: password, p_client_key: clientKey });
  if (error) {
    console.error("Chat password verifier failed:", error.message);
    return json({ error: "服务端验证暂时不可用，请稍后重试。" }, 503);
  }
  if (valid !== true) {
    const entry = recentFailures.get(clientKey) || { count: 0, since: now, blockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= 5) entry.blockedUntil = now + 15 * 60 * 1000;
    recentFailures.set(clientKey, entry);
    return json({ error: entry.blockedUntil > now ? "尝试次数过多，请 15 分钟后再试。" : "密码不正确，请重试。" }, entry.blockedUntil > now ? 429 : 401);
  }
  recentFailures.delete(clientKey);
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + 4 * 60 * 60;
  const accessToken = await signPayload({ aud: "zhi-chat-admin", sub: "admin", iat: issuedAt, exp: expiresAt, jti: crypto.randomUUID() });
  return json({ ok: true, access_token: accessToken, token_type: "Bearer", expires_at: new Date(expiresAt * 1000).toISOString() });
});