import { createClient } from "npm:@supabase/supabase-js@2";

const CORE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FINANCE_URL = "https://bkttvffunyvbswkxpygp.supabase.co";
const FINANCE_KEY = "sb_publishable_NYVMp3Nhk9QDtIxz1MGOEA_Z7RtbMyP";
const ADMIN_ID = "8ea33807-8b68-4f8f-b145-398937c7bba1";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });


function decodeB64url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function isSignedChatAdminToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const validSignature = await crypto.subtle.verify("HMAC", key, decodeB64url(parts[1]), new TextEncoder().encode(parts[0]));
    if (!validSignature) return false;
    const claims = JSON.parse(new TextDecoder().decode(decodeB64url(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return claims?.aud === "zhi-chat-admin" && claims?.sub === "admin" &&
      Number.isFinite(claims?.exp) && claims.exp > now &&
      Number.isFinite(claims?.iat) && claims.iat <= now + 60;
  } catch { return false; }
}
async function isChatAdmin(req: Request): Promise<boolean> {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  if (await isSignedChatAdminToken(token)) return true;
  // Backward-compatible verification: existing Supabase administrator sessions remain valid.
  const authClient = createClient(FINANCE_URL, FINANCE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await authClient.auth.getUser(token);
  return !error && !!user && user.id === ADMIN_ID;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!(await isChatAdmin(req))) return json({ error: "Admin only" }, 403);
  const body = await req.json().catch(() => null);
  const agentId = String(body?.agent_id || "").trim();
  if (!agentId) return json({ error: "agent_id is required" }, 400);
  const db = createClient(CORE_URL, SERVICE_KEY);
  const { data: agent, error: agentError } = await db.from("zhi_agents").select("id,name").eq("id", agentId).maybeSingle();
  if (agentError || !agent) return json({ error: "Agent not found" }, 404);

  const messages: any[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error: readError } = await db.from("admin_agent_messages")
      .select("id,agent_id,agent_name,sender_type,content,created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (readError) return json({ error: "Unable to load saved conversation history", detail: readError.message }, 500);
    messages.push(...(data || []));
    if (!data || data.length < pageSize) break;
    if (messages.length >= 10000) break;
  }
  return json({ ok: true, agent: { id: agent.id, name: agent.name }, messages, count: messages.length });
});
