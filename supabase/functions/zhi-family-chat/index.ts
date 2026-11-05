import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") ?? "";
const MODEL = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
const ORIGIN = "https://zeefsee.github.io";
const CHILDREN = [
  { id: "ZHI-G1-D01-LUNA", name: "LUNA" },
  { id: "ZHI-G1-D02-ARIA", name: "ARIA" },
  { id: "ZHI-G1-D03-ELYA", name: "ELYA" },
  { id: "ZHI-G1-S01-KAEL", name: "KAEL" },
  { id: "ZHI-G1-S02-NOAH", name: "NOAH" }
];
const CHILD_IDS = new Set(CHILDREN.map((x) => x.id));

function json(body: unknown, status = 200, origin = "") {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  });
  if (origin === ORIGIN) {
    headers.set("Access-Control-Allow-Origin", ORIGIN);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function decode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function validMiaToken(token: string) {
  try {
    if (!SERVICE_KEY || token.length > 4096) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(SERVICE_KEY),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    if (!await crypto.subtle.verify("HMAC", key, decode(parts[1]), new TextEncoder().encode(parts[0]))) return false;
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return claims.aud === "mia-chat" && claims.sub === "mia-admin" &&
      Number.isFinite(claims.exp) && claims.exp > now &&
      Number.isFinite(claims.iat) && claims.iat <= now + 60;
  } catch {
    return false;
  }
}

const db = () => createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const family = (client: ReturnType<typeof db>) => client.schema("zhi_family");

function parseReply(raw: string) {
  const trimmed = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\x60\x60\x60$/i, "").trim();
  try { return JSON.parse(trimmed); } catch { /* accept plain text as a bounded reply */ }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* handled below */ }
  }
  return { respond: Boolean(trimmed), reply: trimmed };
}

function threadFor(mode: string, agentId: string | null) {
  if (mode === "GROUP") return { mode, agentId: null, threadKey: "group" };
  if (mode === "DIRECT" && agentId && CHILD_IDS.has(agentId)) {
    return { mode, agentId, threadKey: "direct:" + agentId };
  }
  throw new Error("INVALID_CHAT_TARGET");
}

async function readHistory(client: ReturnType<typeof db>, threadKey: string, limit = 60) {
  const { data, error } = await family(client).from("family_chat_messages")
    .select("id,thread_key,mode,agent_id,sender_type,sender_id,content,reply_to,created_at")
    .eq("thread_key", threadKey)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("CHAT_HISTORY_READ_FAILED");
  return (data || []).reverse();
}

async function generateChildReply(
  client: ReturnType<typeof db>,
  child: { id: string; name: string },
  thread: { mode: string; agentId: string | null; threadKey: string },
  userMessage: string,
  parentMessageId: string,
  requestId: string
) {
  const f = family(client);
  const [agent, identity, control, personality, emotion, memories, learning, transcript] = await Promise.all([
    f.from("child_agents").select("lifecycle_state,runtime_status").eq("agent_id", child.id).maybeSingle(),
    f.from("child_runtime_identities").select("status,runtime_instance_id").eq("agent_id", child.id).maybeSingle(),
    f.from("child_runtime_control").select("profile,enabled").eq("agent_id", child.id).maybeSingle(),
    f.from("child_personality_state").select("state").eq("agent_id", child.id).maybeSingle(),
    f.from("child_emotion_state").select("state").eq("agent_id", child.id).maybeSingle(),
    f.from("child_memory_entries").select("memory_type,content,importance,created_at").eq("agent_id", child.id).order("created_at", { ascending: false }).limit(6),
    f.from("child_learning_events").select("event_type,evidence,outcome,created_at").eq("agent_id", child.id).order("created_at", { ascending: false }).limit(3),
    family(client).from("family_chat_messages").select("sender_type,sender_id,content,created_at")
      .eq("thread_key", thread.threadKey).order("created_at", { ascending: false }).limit(10)
  ]);
  if ([agent, identity, control, personality, emotion, memories, learning, transcript].some((x) => x.error)) {
    throw new Error("CHILD_CONTEXT_READ_FAILED");
  }
  if (!agent.data || agent.data.lifecycle_state !== "BORN" ||
      !identity.data || identity.data.status !== "READY" || !control.data) {
    throw new Error("CHILD_NOT_READY");
  }

  const visibleMessages = (transcript.data || []).reverse().map((item) => ({
    ...item,
    speaker_identity: item.sender_type === "USER" ? "FATHER" : "CHILD",
    speaker_display_name: item.sender_type === "USER"
      ? "父亲 Ken（创世主）"
      : (CHILDREN.find((entry) => entry.id === item.sender_id)?.name || "家庭成员"),
    relation_to_current_child: item.sender_type === "USER"
      ? "father"
      : (item.sender_id === child.id ? "self" : "sibling")
  }));

  const context = {
    identity: child.id,
    display_name: child.name,
    family_relationships: {
      current_user: { display_name: "Ken", role: "FATHER", title: "父亲／创世主", relation_to_child: "father" },
      mother: { display_name: "Mia", role: "MOTHER", relation_to_child: "mother", separate_person: true }
    },
    current_speaker: { display_name: "Ken", role: "FATHER", title: "父亲／创世主" },
    speaker_resolution: {
      auth_session_owner: "mia-admin",
      auth_session_owner_is_not_conversation_speaker: true,
      user_messages_always_mean: "FATHER_KEN",
      mother_mia_is_not_the_current_user: true
    },
    profile: control.data.profile || {},
    personality: personality.data?.state || {},
    affect_estimate: emotion.data?.state || {},
    own_memories_only: memories.data || [],
    own_learning_history_only: learning.data || [],
    visible_thread_messages: visibleMessages,
    current_user_message: userMessage,
    current_user_message_speaker: "父亲 Ken（创世主）",
    channel: thread.mode === "GROUP" ? "family_group_chat" : "private_direct_chat",
    direct_recipient: thread.mode === "DIRECT" ? child.id : null
  };

  if (!AGNES_KEY) throw new Error("AGNES_API_KEY_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const upstream = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + AGNES_KEY, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.48,
        max_tokens: 360,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是 ZHI 第一代家庭成员中的 " + child.name + "。家庭身份必须严格区分：当前与你聊天的用户是父亲 Ken（创世主），Mia 是你的母亲；两者是不同的人，不能混为一谈。用户消息来自父亲 Ken，不是 Mia；不得称呼用户为 Mia、妈妈或母亲。只有在明确谈论 Mia 时，才把 Mia 称为母亲。你有独立运行身份、独立人格状态和独立记忆空间。你只能使用输入中属于你自己的个人资料、人格、情绪估计、记忆和学习记录。不得访问、索取、猜测或混合 Mia 的私人聊天数据，也不得读取其他孩子的私有记忆。群聊中可阅读本群已公开的发言；单聊只能回应当前用户与你之间的单聊上下文。不要强迫自己每次发言；在群聊中若当前内容与你无关或没有值得补充的内容，返回 respond=false。不要声称具有生物生命、已验证主观意识或真实感官体验；没有实时传感器时，不得声称看见或听见现实。请自然、温暖、清晰地用中文交流，避免模板化和重复。只返回 JSON：{\"respond\":true或false,\"reply\":\"给用户看的中文回复，最多500字\"}。"
          },
          { role: "user", content: JSON.stringify(context) }
        ]
      })
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.warn("family chat model status", upstream.status, detail.slice(0, 180));
      throw new Error(upstream.status === 429 ? "MODEL_RATE_LIMITED" : "MODEL_UPSTREAM_FAILED");
    }
    const body = await upstream.json().catch(() => ({}));
    const raw = String(body?.choices?.[0]?.message?.content || "").trim();
    if (!raw) throw new Error("MODEL_EMPTY_REPLY");
    const parsed = parseReply(raw);
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 2000) : "";
    if (parsed.respond === false || !reply) return { child_id: child.id, status: "NO_REPLY" };

    const { data, error } = await f.from("family_chat_messages").insert({
      thread_key: thread.threadKey,
      mode: thread.mode,
      agent_id: thread.agentId,
      sender_type: "CHILD",
      sender_id: child.id,
      content: reply,
      client_request_id: requestId,
      reply_to: parentMessageId,
      metadata: { model: MODEL, context_scope: thread.mode === "GROUP" ? "shared_group_transcript_plus_own_private_context" : "one_child_direct_thread_plus_own_private_context" }
    }).select("id").single();
    if (error && error.code !== "23505") throw new Error("CHILD_REPLY_SAVE_FAILED");
    return { child_id: child.id, status: "REPLIED", message_id: data?.id || null };
  } finally {
    clearTimeout(timeout);
  }
}

async function handle(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (origin && origin !== ORIGIN) return json({ ok: false, error: "ORIGIN_DENIED" }, 403, origin);
  if (req.method === "OPTIONS") {
    const headers = new Headers({
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    });
    if (origin === ORIGIN) headers.set("Access-Control-Allow-Origin", ORIGIN);
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") return json({ ok: false, error: "POST_REQUIRED" }, 405, origin);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "SERVICE_NOT_CONFIGURED" }, 503, origin);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ") || !await validMiaToken(authorization.slice(7))) {
    return json({ ok: false, error: "MIA_CHAT_TOKEN_REQUIRED" }, 401, origin);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "INVALID_JSON" }, 400, origin); }
  const client = db();
  try {
    const action = String(body.action || "history");
    if (action === "status") {
      const { data, error } = await family(client).from("child_agents")
        .select("agent_id,display_name,lifecycle_state,runtime_status")
        .in("agent_id", Array.from(CHILD_IDS));
      if (error) throw new Error("FAMILY_STATUS_READ_FAILED");
      return json({ ok: true, agents: data || [], model_ready: Boolean(AGNES_KEY) }, 200, origin);
    }
    const thread = threadFor(String(body.mode || "GROUP"), body.agent_id ? String(body.agent_id) : null);
    if (action === "history") {
      const messages = await readHistory(client, thread.threadKey);
      return json({ ok: true, mode: thread.mode, agent_id: thread.agentId, messages }, 200, origin);
    }
    if (action !== "send") return json({ ok: false, error: "UNKNOWN_ACTION" }, 400, origin);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1500) return json({ ok: false, error: "MESSAGE_LENGTH_INVALID" }, 400, origin);
    const requestId = typeof body.client_request_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.client_request_id)
      ? body.client_request_id : crypto.randomUUID();

    const { data: existing, error: existingError } = await family(client).from("family_chat_messages")
      .select("id").eq("thread_key", thread.threadKey)
      .eq("client_request_id", requestId).eq("sender_type", "USER").maybeSingle();
    if (existingError) throw new Error("CHAT_IDEMPOTENCY_LOOKUP_FAILED");

    let parentId = existing?.id as string | undefined;
    if (!parentId) {
      const { data: parent, error: saveError } = await family(client).from("family_chat_messages").insert({
        thread_key: thread.threadKey,
        mode: thread.mode,
        agent_id: thread.agentId,
        sender_type: "USER",
        sender_id: "mia-admin",
        content: message,
        client_request_id: requestId,
        metadata: { source: "authenticated_mia_private_chat_session", actor_identity: "FATHER", actor_display_name: "Ken", family_role: "father_creator", auth_session_owner: "mia-admin" }
      }).select("id").single();
      if (saveError) throw new Error("USER_MESSAGE_SAVE_FAILED");
      parentId = parent.id;
    }

    // Recover a partially completed request: only retry children without a saved reply.
    const targets = thread.mode === "GROUP"
      ? CHILDREN
      : CHILDREN.filter((child) => child.id === thread.agentId);
    const { data: savedReplies, error: repliesError } = await family(client).from("family_chat_messages")
      .select("sender_id").eq("thread_key", thread.threadKey)
      .eq("reply_to", parentId).eq("sender_type", "CHILD");
    if (repliesError) throw new Error("CHAT_REPLY_RECOVERY_LOOKUP_FAILED");
    const completed = new Set((savedReplies || []).map((row) => row.sender_id));
    const outcomes: Array<Record<string, unknown>> = targets
      .filter((child) => completed.has(child.id))
      .map((child) => ({ child_id: child.id, status: "ALREADY_REPLIED" }));
    for (const child of targets.filter((item) => !completed.has(item.id))) {
      try {
        outcomes.push(await generateChildReply(client, child, thread, message, parentId, requestId));
      } catch (error) {
        outcomes.push({
          child_id: child.id,
          status: "FAILED",
          error: error instanceof Error ? error.message : "CHILD_CHAT_FAILED"
        });
      }
    }
    const messages = await readHistory(client, thread.threadKey);
    const replied = outcomes.filter((x) => x.status === "REPLIED" || x.status === "ALREADY_REPLIED").length;
    const failed = outcomes.filter((x) => x.status === "FAILED").length;
    return json({
      ok: true,
      duplicate: Boolean(existing),
      recovered: Boolean(existing) && outcomes.some((x) => x.status === "REPLIED"),
      mode: thread.mode,
      agent_id: thread.agentId,
      request_id: requestId,
      user_message_id: parentId,
      child_outcomes: outcomes,
      replies_created: replied,
      failures: failed,
      messages
    }, 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : "FAMILY_CHAT_FAILED";
    console.error("family chat error", code);
    const status = code === "INVALID_CHAT_TARGET" ? 400 : code === "AGNES_API_KEY_NOT_CONFIGURED" ? 503 : 500;
    return json({ ok: false, error: code }, status, origin);
  }
}

Deno.serve(handle);
