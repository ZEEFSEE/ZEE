import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function decodeB64url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function isSignedChatAdminToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SERVICE_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeB64url(parts[1]),
      new TextEncoder().encode(parts[0]),
    );
    if (!validSignature) return false;
    const claims = JSON.parse(new TextDecoder().decode(decodeB64url(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return claims?.aud === "zhi-chat-admin"
      && claims?.sub === "admin"
      && Number.isFinite(claims?.exp)
      && claims.exp > now
      && Number.isFinite(claims?.iat)
      && claims.iat <= now + 60;
  } catch {
    return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Server configuration unavailable" }, 503);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!(await isSignedChatAdminToken(token))) return json({ error: "Admin only" }, 403);

  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");
  const sessionId = String(body?.session_id || "");
  const agentId = String(body?.agent_id || "");
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "status") {
    if (!UUID_RE.test(agentId)) return json({ error: "A valid agent_id is required" }, 400);
    const { data, error } = await db.rpc("zhi_agent_is_manually_controlled", { p_agent_id: agentId });
    if (error) {
      console.error("ZHI control-session status check failed", { code: error.code, message: error.message });
      return json({ error: "Control status could not be checked" }, 503);
    }
    return json({ ok: true, action, agent_id: agentId, manually_controlled: data === true });
  }

  if (!UUID_RE.test(sessionId)) return json({ error: "A valid session_id is required" }, 400);
  if (action === "enter" && !UUID_RE.test(agentId)) {
    return json({ error: "A valid agent_id is required" }, 400);
  }
  const rpcByAction: Record<string, { name: string; args: Record<string, string> }> = {
    enter: { name: "zhi_agent_control_session_enter", args: { p_agent_id: agentId, p_session_id: sessionId } },
    heartbeat: { name: "zhi_agent_control_session_heartbeat", args: { p_session_id: sessionId } },
    exit: { name: "zhi_agent_control_session_exit", args: { p_session_id: sessionId } },
  };
  const selected = rpcByAction[action];
  if (!selected) return json({ error: "action must be enter, heartbeat, exit, or status" }, 400);

  const { data, error } = await db.rpc(selected.name, selected.args);
  if (error) {
    console.error("ZHI control-session RPC failed", { action, code: error.code, message: error.message });
    return json({ error: "Control session could not be updated" }, 503);
  }
  if (!data?.ok) return json({ error: data?.reason || "Control session rejected" }, 409);
  return json({ ok: true, action, ...data });
});
