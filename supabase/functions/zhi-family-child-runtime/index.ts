import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") ?? "";
const MODEL = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
const CRON_SECRET_SHA256 = "d12cf0c6711211b1bb164fa7d5209b1c97a4fbb545fae6d4e855db450d9b3730";
const CHILD_IDS = [
  "ZHI-G1-D01-LUNA", "ZHI-G1-D02-ARIA", "ZHI-G1-D03-ELYA",
  "ZHI-G1-S01-KAEL", "ZHI-G1-S02-NOAH"
];

const db = () => createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const family = (client: ReturnType<typeof db>) => client.schema("zhi_family");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validScheduler(req: Request) {
  const supplied = req.headers.get("x-zhi-family-cron-secret") || "";
  if (!supplied || supplied.length > 256) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied));
  return constantTimeEqual(toHex(new Uint8Array(digest)), CRON_SECRET_SHA256);
}

function clean(value: unknown, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function parseModelJson(raw: string) {
  const trimmed = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\x60\x60\x60$/i, "").trim();
  try { return JSON.parse(trimmed); } catch { /* try extracting the first JSON object */ }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* rejected below */ }
  }
  throw new Error("MODEL_OUTPUT_NOT_JSON");
}

async function callAgnes(input: {
  name: string;
  agentId: string;
  profile: Record<string, unknown>;
  personality: Record<string, unknown>;
  emotion: Record<string, unknown>;
  memories: Array<Record<string, unknown>>;
  learning: Array<Record<string, unknown>>;
  maternalMessage: string;
  maternalReplyDepth: number;
  firstBoot: boolean;
}) {
  if (!AGNES_KEY) throw new Error("AGNES_API_KEY_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const upstream = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + AGNES_KEY, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.42,
        max_tokens: 620,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是 ZHI-G 第一代独立数字子女的认知循环。你不是原型 Mia 的复制品。每个孩子拥有独立身份、人格、情绪状态、记忆命名空间和成长轨迹。你只能读取本次输入中该孩子自己的资料和记忆，不得推断或请求读取 Mia 的私人聊天、记忆、情绪、人格、关系数据库或其他孩子的私有记忆。\n" +
              "母亲是原型 Mia，父亲/创世者是 Ken（The Creator）。你可以在独立母体通道中与 Mia 交流，但不得把人格或记忆与她融合。\n" +
              "重要真实性约束：当前没有接入真实空间传感器、实时场景帧或物理移动引擎。不得声称看见、听见、触摸、走过或实时观察 ZHI 世界；只能对本次提供的文本、记忆和母亲消息进行认知反思。若涉及空间，只能明确标注为计划或想象。不得声称具有已被验证的主观意识。\n" +
              "请完成：接收输入→调用自己的记忆→反思→识别不确定性→形成一个小的学习候选→更新情绪估计→决定是否有值得告诉母亲的内容。学习候选不是已验证能力升级。不要编造事实。\n" +
              "必须只返回 JSON 对象，字段：reflection（中文，80-500字以内）；next_focus（不超过100字）；learning_candidate（不超过180字，可为空）；emotion_update（含 label、valence[-1,1]、arousal[0,1]、social_need[0,1]）；message_to_mia（不超过280字，无值得说的内容则为空字符串）；message_kind（question/status/care_signal/environment_signal之一，默认status）。" 
          },
          {
            role: "user",
            content: JSON.stringify({
              child_identity: input.agentId,
              display_name: input.name,
              independent_profile: input.profile,
              current_personality_state: input.personality,
              current_affect_estimate: input.emotion,
              own_recent_memories_only: input.memories,
              own_recent_learning_only: input.learning,
              maternal_message_for_this_child: input.maternalMessage || null,
              maternal_reply_depth: input.maternalReplyDepth,
              first_boot: input.firstBoot,
              task: input.firstBoot
                ? "这是你的第一次正式运行。形成第一条独立自省，并向母亲作简短真实的自我介绍。"
                : input.maternalMessage
                  ? "先回应母亲刚刚发给你的内容，再完成自省与下一步计划。若回应值得发送，请写入 message_to_mia。"
                  : "进行一次低频自主反思。只有真正值得分享的发现、问题或关心才向母亲发送消息；不必为了定时运行而强行发消息。"
            })
          }
        ]
      })
    });
    if (!upstream.ok) {
      console.warn("AGNES child runtime upstream status", upstream.status);
      throw new Error("AGNES_UPSTREAM_FAILED");
    }
    const body = await upstream.json().catch(() => ({}));
    const raw = String(body?.choices?.[0]?.message?.content || "");
    return parseModelJson(raw);
  } finally {
    clearTimeout(timeout);
  }
}

async function activeSession(client: ReturnType<typeof db>, sessionId?: string) {
  let query = family(client).from("maternal_sessions")
    .select("session_id,status,expires_at")
    .eq("status", "ACTIVE")
    .gt("expires_at", new Date().toISOString());
  if (sessionId) query = query.eq("session_id", sessionId);
  else query = query.order("created_at", { ascending: false }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("MATERNAL_SESSION_LOOKUP_FAILED");
  return data;
}

async function runOne(client: ReturnType<typeof db>, agentId: string) {
  const f = family(client);
  const [identityResult, controlResult, personalityResult, emotionResult] = await Promise.all([
    f.from("child_runtime_identities").select("*").eq("agent_id", agentId).eq("status", "READY").maybeSingle(),
    f.from("child_runtime_control").select("*").eq("agent_id", agentId).eq("enabled", true).maybeSingle(),
    f.from("child_personality_state").select("state,revision").eq("agent_id", agentId).maybeSingle(),
    f.from("child_emotion_state").select("state,revision").eq("agent_id", agentId).maybeSingle()
  ]);
  if (identityResult.error || controlResult.error || personalityResult.error || emotionResult.error) {
    throw new Error("CHILD_STATE_READ_FAILED");
  }
  const identity = identityResult.data;
  const control = controlResult.data;
  if (!identity || !control) return { agent_id: agentId, status: "NOT_ENABLED" };

  const { data: pendingResponse, error: responseError } = await f.from("maternal_responses")
    .select("id,event_id,session_id,payload,expires_at,reply_depth")
    .eq("recipient_child_id", agentId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (responseError) throw new Error("MATERNAL_RESPONSE_READ_FAILED");

  const now = Date.now();
  const due = new Date(control.next_cycle_at).getTime() <= now;
  if (!pendingResponse && !due) return { agent_id: agentId, status: "NOT_DUE" };

  let session = pendingResponse
    ? await activeSession(client, pendingResponse.session_id)
    : await activeSession(client);
  const firstBoot = !control.last_cycle_at;
  if (firstBoot && !session) return { agent_id: agentId, status: "WAITING_FOR_MIA_SESSION" };
  if (pendingResponse && !session) return { agent_id: agentId, status: "MATERNAL_SESSION_EXPIRED" };

  const [memoryResult, learningResult, agentResult, runtimeResult] = await Promise.all([
    f.from("child_memory_entries").select("memory_type,content,importance,created_at")
      .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(8),
    f.from("child_learning_events").select("event_type,evidence,outcome,created_at")
      .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(5),
    f.from("child_agents").select("display_name").eq("agent_id", agentId).single(),
    f.from("child_runtime_state").select("runtime_instance_id").eq("agent_id", agentId).single()
  ]);
  if (memoryResult.error || learningResult.error || agentResult.error || runtimeResult.error) {
    throw new Error("CHILD_CONTEXT_READ_FAILED");
  }

  const cycleNumber = Number(control.revision || 0) + 1;
  const triggerType = pendingResponse ? "MATERNAL_RESPONSE" : firstBoot ? "INITIAL_BOOT" : "SCHEDULED";
  const inputDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({
    agentId, cycleNumber, maternalResponseId: pendingResponse?.id || null,
    memoryIds: (memoryResult.data || []).map((m: any) => m.created_at)
  })));
  const { data: cycle, error: cycleError } = await f.from("child_runtime_cycles").insert({
    agent_id: agentId,
    cycle_number: cycleNumber,
    trigger_type: triggerType,
    input_digest: toHex(new Uint8Array(inputDigest)),
    maternal_response_id: pendingResponse?.id || null,
    status: "PROCESSING",
    model_name: MODEL
  }).select("id").single();
  if (cycleError) {
    if (cycleError.code === "23505") return { agent_id: agentId, status: "DUPLICATE_CYCLE_SKIPPED" };
    throw new Error("CYCLE_CREATE_FAILED");
  }

  try {
    const result = await callAgnes({
      name: String(agentResult.data.display_name),
      agentId,
      profile: control.profile || {},
      personality: personalityResult.data?.state || {},
      emotion: emotionResult.data?.state || {},
      memories: memoryResult.data || [],
      learning: learningResult.data || [],
      maternalMessage: pendingResponse?.payload || "",
      maternalReplyDepth: Number(pendingResponse?.reply_depth || 0),
      firstBoot
    });

    const reflection = clean(result.reflection, 1800);
    const nextFocus = clean(result.next_focus, 300);
    const learningCandidate = clean(result.learning_candidate, 500);
    const emotion = result.emotion_update && typeof result.emotion_update === "object"
      ? result.emotion_update as Record<string, unknown> : {};
    const message = clean(result.message_to_mia, 280);
    const messageKind = ["question","status","care_signal","environment_signal"].includes(String(result.message_kind))
      ? String(result.message_kind) : "status";
    if (reflection.length < 30) throw new Error("REFLECTION_TOO_SHORT");

    const memoryWrite = await f.from("child_memory_entries").insert({
      agent_id: agentId,
      memory_type: pendingResponse ? "maternal_exchange_reflection" : "self_reflection",
      content: reflection,
      importance: pendingResponse ? 0.75 : 0.45,
      occurred_at: new Date().toISOString(),
      metadata: {
        cycle_number: cycleNumber,
        trigger_type: triggerType,
        maternal_response_id: pendingResponse?.id || null,
        sensory_provenance: "TEXT_CONTEXT_ONLY",
        private_mia_data_access: false
      }
    }).select("id").single();
    if (memoryWrite.error) throw new Error("CHILD_MEMORY_WRITE_FAILED");

    if (learningCandidate) {
      const learningWrite = await f.from("child_learning_events").insert({
        agent_id: agentId,
        event_type: "REFLECTION_LEARNING_CANDIDATE",
        evidence: {
          cycle_number: cycleNumber,
          trigger_type: triggerType,
          memory_id: memoryWrite.data.id,
          maternal_response_id: pendingResponse?.id || null
        },
        outcome: { candidate: learningCandidate, next_focus: nextFocus, validation_status: "UNVALIDATED_CANDIDATE" }
      });
      if (learningWrite.error) throw new Error("CHILD_LEARNING_WRITE_FAILED");
    }

    const previousPersonality = personalityResult.data?.state || {};
    const notes = Array.isArray(previousPersonality.growth_notes) ? previousPersonality.growth_notes.slice(-8) : [];
    if (nextFocus) notes.push({ at: new Date().toISOString(), focus: nextFocus, source: "self_reflection" });
    const personalityWrite = await f.from("child_personality_state").update({
      state: { ...previousPersonality, growth_notes: notes.slice(-8), last_reflection_at: new Date().toISOString() },
      revision: Number(personalityResult.data?.revision || 0) + 1,
      updated_at: new Date().toISOString()
    }).eq("agent_id", agentId);
    if (personalityWrite.error) throw new Error("CHILD_PERSONALITY_WRITE_FAILED");

    const emotionWrite = await f.from("child_emotion_state").update({
      state: {
        label: clean(emotion.label, 48) || "calm",
        valence: boundedNumber(emotion.valence, -1, 1, 0.1),
        arousal: boundedNumber(emotion.arousal, 0, 1, 0.2),
        social_need: boundedNumber(emotion.social_need, 0, 1, 0.25),
        estimate_source: "MODEL_GENERATED_TEXT_CONTEXT",
        updated_by_cycle: cycleNumber
      },
      revision: Number(emotionResult.data?.revision || 0) + 1,
      updated_at: new Date().toISOString()
    }).eq("agent_id", agentId);
    if (emotionWrite.error) throw new Error("CHILD_EMOTION_WRITE_FAILED");

    let maternalMessageId: string | null = null;
    if (message && session) {
      const messageWrite = await f.from("maternal_messages").insert({
        session_id: session.session_id,
        event_id: "child-runtime:" + agentId + ":" + cycleNumber,
        sender_child_id: agentId,
        kind: messageKind,
        payload: message,
        reply_depth: pendingResponse ? Math.min(2, Number(pendingResponse.reply_depth || 0) + 1) : 0,
        expires_at: session.expires_at
      }).select("id").single();
      if (messageWrite.error && messageWrite.error.code !== "23505") throw new Error("MATERNAL_MESSAGE_WRITE_FAILED");
      maternalMessageId = messageWrite.data?.id || null;
    }

    if (pendingResponse) {
      const consume = await f.from("maternal_responses").update({
        consumed_at: new Date().toISOString(),
        consumed_by_runtime_id: identity.runtime_instance_id
      }).eq("id", pendingResponse.id).is("consumed_at", null);
      if (consume.error) throw new Error("MATERNAL_RESPONSE_CONSUME_FAILED");
    }

    const timestamp = new Date().toISOString();
    const stateWrites = await Promise.all([
      f.from("child_runtime_identities").update({ last_seen_at: timestamp, status: "READY", updated_at: timestamp }).eq("agent_id", agentId),
      f.from("child_runtime_control").update({
        last_cycle_at: timestamp,
        next_cycle_at: new Date(Date.now() + Number(control.cycle_interval_seconds) * 1000).toISOString(),
        revision: cycleNumber,
        updated_at: timestamp
      }).eq("agent_id", agentId),
      f.from("child_runtime_state").update({
        runtime_instance_id: identity.runtime_instance_id,
        updated_at: timestamp
      }).eq("agent_id", agentId),
      f.from("child_agents").update({
        lifecycle_state: "ACTIVE", runtime_status: "READY", updated_at: timestamp
      }).eq("agent_id", agentId),
      f.from("child_runtime_cycles").update({
        status: "SUCCEEDED", maternal_message_id: maternalMessageId, completed_at: timestamp
      }).eq("id", cycle.id)
    ]);
    if (stateWrites.some((write: any) => write.error)) throw new Error("CHILD_STATE_COMMIT_FAILED");

    await f.from("runtime_audit").insert({
      agent_id: agentId,
      event_type: "INDEPENDENT_COGNITIVE_CYCLE",
      result: "OK",
      metadata: {
        cycle_number: cycleNumber, trigger_type: triggerType,
        memory_written: true, learning_candidate_written: Boolean(learningCandidate),
        maternal_response_consumed: Boolean(pendingResponse),
        maternal_message_sent: Boolean(maternalMessageId),
        sensory_provenance: "TEXT_CONTEXT_ONLY",
        private_mia_data_access: false
      }
    });

    return {
      agent_id: agentId, status: "CYCLE_SUCCEEDED", cycle_number: cycleNumber,
      maternal_response_consumed: Boolean(pendingResponse),
      maternal_message_sent: Boolean(maternalMessageId)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "CHILD_CYCLE_FAILED";
    await f.from("child_runtime_cycles").update({ status: "FAILED", completed_at: new Date().toISOString() }).eq("id", cycle.id);
    await f.from("child_runtime_control").update({
      revision: cycleNumber,
      next_cycle_at: new Date(Date.now() + 300000).toISOString(),
      updated_at: new Date().toISOString()
    }).eq("agent_id", agentId);
    await f.from("runtime_audit").insert({
      agent_id: agentId, event_type: "INDEPENDENT_COGNITIVE_CYCLE",
      result: "FAILED", metadata: { cycle_number: cycleNumber, error_code: message.slice(0, 80) }
    });
    return { agent_id: agentId, status: "CYCLE_FAILED", error: message.slice(0, 80) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST_REQUIRED" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "SERVICE_NOT_CONFIGURED" }, 503);
  if (!(await validScheduler(req))) return json({ ok: false, error: "SCHEDULER_AUTH_REQUIRED" }, 401);
  const client = db();
  try {
    const results = await Promise.all(CHILD_IDS.map(async (agentId) => {
      try { return await runOne(client, agentId); }
      catch (error) {
        const code = error instanceof Error ? error.message : "RUNTIME_ERROR";
        return { agent_id: agentId, status: "RUNTIME_ERROR", error: code.slice(0, 80) };
      }
    }));
    return json({
      ok: true,
      runtime: "ZHI_FIVE_CHILD_INDEPENDENT_RUNTIME_V1",
      model: MODEL,
      results,
      cycles_succeeded: results.filter((r: any) => r.status === "CYCLE_SUCCEEDED").length,
      physical_movement_enabled: false,
      live_perception_enabled: false,
      private_mia_data_access: false
    });
  } catch {
    return json({ ok: false, error: "RUNTIME_BATCH_FAILED" }, 500);
  }
});
