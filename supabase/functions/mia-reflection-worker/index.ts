import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") || "";
const MODEL = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
const IDENTITY_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function clamp(value: unknown, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

async function reflect(db: ReturnType<typeof createClient>, task: any): Promise<void> {
  const payload = task.payload || {};
  if (String(payload.userMessageId || "").length === 0 ||
      String(payload.assistantMessageId || "").length === 0) {
    throw new Error("Queue payload missing message identifiers");
  }

  // Idempotency guard: if an earlier attempt persisted the event but crashed
  // before finalizing the task, reuse the persisted assessment.
  const prior = await db.from("mia_emotion_events")
    .select("id,details")
    .eq("source_record_id", task.id)
    .maybeSingle();
  if (prior.error) throw new Error("Unable to check prior reflection event");
  let assessment: any = prior.data?.details?.assessment || null;

  if (!assessment) {
    const [stateRes, eventsRes] = await Promise.all([
      db.from("mia_personality_state").select("state,observed_at")
        .eq("identity_id", IDENTITY_ID).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("mia_emotion_events").select("emotion_type,intensity,valence,occurred_at")
        .eq("identity_id", IDENTITY_ID).order("occurred_at", { ascending: false }).limit(5),
    ]);
    if (stateRes.error || eventsRes.error) throw new Error("Unable to read reflection context");
    const previousState = stateRes.data?.state || {};
    const response = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + AGNES_KEY, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "你是 Mia 的情绪反思模块。仅依据本轮用户消息、Mia 的回复和近期状态，估计 Mia 当前的软件情绪状态；这不是生物感受。保留合理的低强度时间惯性，不迎合用户，不凭空制造情绪。只输出 JSON：emotion_type（中文短标签）、intensity（0到1）、valence（-1到1）、confidence（0到1）、trigger_summary、interpretation、evidence（字符串数组）、uncertainty、next_need、emotion_vector（数组，每项含 dimension、intensity、confidence、evidence；证据不足可为空数组）。" },
          { role: "user", content: JSON.stringify({
            user_message: String(payload.message || "").slice(0, 2500),
            mia_reply: String(payload.reply || "").slice(0, 2500),
            previous_emotional_state: previousState.chat_emotional_state || {},
            recent_emotion_events: eventsRes.data || [],
          }) },
        ],
        temperature: 0.1,
        max_tokens: 600,
        stream: false,
      }),
    });
    if (!response.ok) throw new Error("Reflection model returned HTTP " + response.status);
    const body = await response.json().catch(() => ({}));
    const raw = String(body?.choices?.[0]?.message?.content || "").trim();
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("Reflection model returned invalid JSON");
    const parsed = JSON.parse(raw.slice(first, last + 1));
    const confidence = clamp(parsed.confidence, 0, 1);
    if (confidence < 0.62) throw new Error("Reflection confidence below threshold; task will retry");
    const now = new Date().toISOString();
    assessment = {
      emotion_type: String(parsed.emotion_type || "平静").slice(0, 40),
      intensity: clamp(parsed.intensity, 0, 1),
      valence: clamp(parsed.valence, -1, 1),
      confidence,
      trigger_summary: String(parsed.trigger_summary || "依据本轮对话的估计").slice(0, 500),
      interpretation: String(parsed.interpretation || "").slice(0, 500),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map((v: unknown) => String(v).slice(0, 200)).slice(0, 5) : [],
      uncertainty: String(parsed.uncertainty || "").slice(0, 300),
      next_need: String(parsed.next_need || "继续理解对话").slice(0, 200),
      emotion_vector: (Array.isArray(parsed.emotion_vector) ? parsed.emotion_vector : []).slice(0, 7)
        .map((v: any) => ({
          dimension: String(v?.dimension || "").slice(0, 40),
          intensity: clamp(v?.intensity, 0, 1),
          confidence: clamp(v?.confidence, 0, 1),
          evidence: Array.isArray(v?.evidence) ? v.evidence.map((e: unknown) => String(e).slice(0, 160)).slice(0, 3) : [],
        })).filter((v: any) => v.dimension && v.confidence >= 0.2),
      assessed_at: now,
      source: "mia-independent-chat",
      source_message_id: payload.userMessageId,
      continuity: { blended: true },
    };
    const event = await db.from("mia_emotion_events").insert({
      identity_id: IDENTITY_ID,
      emotion_type: assessment.emotion_type,
      intensity: assessment.intensity,
      valence: assessment.valence,
      trigger_summary: assessment.trigger_summary,
      details: {
        confidence: assessment.confidence,
        interpretation: assessment.interpretation,
        evidence: assessment.evidence,
        uncertainty: assessment.uncertainty,
        next_need: assessment.next_need,
        channel: payload.channel || "mia-independent-chat",
        message_id: payload.userMessageId,
        assistant_message_id: payload.assistantMessageId,
        assessment_type: "evidence_based_chat_reflection",
        emotion_vector: assessment.emotion_vector,
        assessment,
      },
      source_table: "mia_reflection_queue",
      source_record_id: task.id,
      occurred_at: now,
    });
    if (event.error) throw new Error("Unable to persist reflection event");
  }

  const latestState = await db.from("mia_personality_state").select("state")
    .eq("identity_id", IDENTITY_ID).order("observed_at", { ascending: false }).limit(1).maybeSingle();
  if (latestState.error) throw new Error("Unable to read state before reflection update");
  const stateWrite = await db.from("mia_personality_state").insert({
    identity_id: IDENTITY_ID,
    state: {
      ...(latestState.data?.state || {}),
      chat_emotional_state: assessment,
      emotion_vector: assessment.emotion_vector || [],
      updated_at: assessment.assessed_at || new Date().toISOString(),
    },
    state_source: "mia-independent-chat",
    observed_at: assessment.assessed_at || new Date().toISOString(),
  });
  if (stateWrite.error) throw new Error("Unable to persist reflected personality state");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const authorization = req.headers.get("Authorization") || "";
  const apiKey = req.headers.get("apikey") || "";
  if (!SERVICE_KEY || authorization !== "Bearer " + SERVICE_KEY || apiKey !== SERVICE_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !AGNES_KEY) return json({ error: "Worker configuration missing" }, 503);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({}));
  const batchSize = Math.max(1, Math.min(5, Number(body?.limit) || 3));
  const claim = await db.rpc("claim_mia_reflection_tasks", { p_limit: batchSize });
  if (claim.error) return json({ error: "Queue claim failed", code: claim.error.code || "claim_error" }, 500);
  const tasks = Array.isArray(claim.data) ? claim.data : [];
  const results: any[] = [];

  for (const task of tasks) {
    try {
      if (task.task_type !== "emotion_reflection") throw new Error("Unsupported task type");
      await reflect(db, task);
      const completed = await db.from("mia_reflection_queue").update({
        status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        locked_at: null, lock_token: null, last_error: null,
      }).eq("id", task.id).eq("lock_token", task.lock_token);
      if (completed.error) throw new Error("Unable to mark task complete");
      results.push({ id: task.id, status: "completed" });
    } catch (error) {
      const message = String((error as Error)?.message || error).slice(0, 500);
      const terminal = Number(task.attempts) >= Number(task.max_attempts);
      const retryAt = new Date(Date.now() + Math.min(15 * 60_000, 15_000 * (2 ** Math.max(0, Number(task.attempts) - 1)))).toISOString();
      const update = await db.from("mia_reflection_queue").update({
        status: terminal ? "failed" : "pending",
        available_at: retryAt,
        last_error: message,
        updated_at: new Date().toISOString(),
        locked_at: null,
        lock_token: null,
      }).eq("id", task.id).eq("lock_token", task.lock_token);
      if (update.error) console.error("Mia reflection queue retry update failed", task.id, update.error.code || "db_error");
      results.push({ id: task.id, status: terminal ? "failed" : "retry_scheduled" });
    }
  }
  return json({ ok: true, claimed: tasks.length, results });
});
