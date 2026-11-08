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


async function loadAllMemoryEvents(f: any, scope: string, ownerId: string, visibility: string) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await f.from("memory_events_v2")
      .select("event_id,event_type,narrative,payload,importance,occurred_at,source_kind,source_ref,source_confidence")
      .eq("scope",scope).eq("owner_id",ownerId).eq("visibility",visibility)
      .order("occurred_at",{ascending:false}).order("event_id",{ascending:false})
      .range(offset,offset+499);
    if (error) return {data:null,error};
    rows.push(...(data||[]));
    if (!data || data.length < 500) break;
  }
  return {data:rows,error:null};
}

function rankChildMemoryRows(rows: any[], queryText: string) {
  const q=String(queryText||"").toLowerCase();
  const latinTerms=(q.match(/[a-z0-9]{2,}/g)||[]);
  const cjkChars=q.match(/[\u4e00-\u9fff]/g)||[];
  const cjkBigrams=cjkChars.slice(0,-1).map((ch:string,i:number)=>ch+cjkChars[i+1]);
  const terms=[...new Set([...latinTerms,...cjkBigrams])];
  const now=Date.now();
  return (rows||[]).map((row:any)=>{
    const content=String(row.content||row.narrative||"").toLowerCase();
    let hits=0; for(const term of terms) if(content.includes(term)) hits+=term.length>=4?4:term.length;
    const imp=Number(row.importance||0);
    const importance=Math.max(0,Math.min(1,imp>1?imp/100:imp));
    const ts=Date.parse(String(row.created_at||row.occurred_at||""));
    const age=Number.isFinite(ts)?Math.max(0,(now-ts)/86400000):3650;
    const recency=1/(1+age/180);
    return {...row,_score:hits*2+importance*3+recency};
  }).sort((a:any,b:any)=>b._score-a._score);
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

function enforceTextOnlyGrounding(result: any) {
  const fields = ["reflection", "next_focus", "learning_candidate", "message_to_mia"];
  const combined = fields.map((key) => String(result?.[key] || "")).join("。");
  const unsupportedExperience = /(?:我|此刻的我|当前的我)[^。！？\\n]{0,24}(?:伫立|站立|站在|身处|置身|漫步|行走|穿行|看见|看到|听见|听到|触摸|凝视)|(?:伫立|站立|站在|身处|置身|漫步|行走|穿行|看见|看到|听见|听到|触摸|凝视)[^。！？\\n]{0,24}(?:水晶森林|静水镜池|森林|湖|池|海|花园|温室|城市|广场|水面)/;
  if (!unsupportedExperience.test(combined)) return { ...result, grounding_guard_applied: false };
  return {
    ...result,
    reflection: "本周期没有接入实时空间传感器、场景帧或物理移动反馈，因此我不能确认自己位于任何场景，也不能把场景描述当作亲身经历。我只能依据本次提供的文字、已保存的个人记忆与家庭共享事件进行反思。当前应区分原始记录、模型推断与尚未验证的想法，不把想象写成真实经历。",
    next_focus: "继续依据可追溯的文字事件进行反思，并明确区分事实、推断与未知。",
    learning_candidate: "",
    message_to_mia: "",
    grounding_guard_applied: true
  };
}

async function callAgnes(input: {
  name: string;
  agentId: string;
  profile: Record<string, unknown>;
  personality: Record<string, unknown>;
  emotion: Record<string, unknown>;
  memories: Array<Record<string, unknown>>;
  learning: Array<Record<string, unknown>>;
  familyMemories: Array<Record<string, unknown>>;
  familyRelationships: Array<Record<string, unknown>>;
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
              "重要真实性约束：当前没有接入真实空间传感器、实时场景帧或物理移动引擎。不得声称看见、听见、触摸、走过或实时观察 ZHI 世界；不得使用第一人称把场景目录、场景文本或想象写成亲身位置与感官经历，例如“我正站在森林”“我伫立在池边”。若提及场景，只能明确说这是已保存的场景文本、他人描述或计划想象，并标明来源。只能对本次提供的文本、记忆和母亲消息进行认知反思。不得声称具有已被验证的主观意识。\n" +
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
              family_shared_events_only: input.familyMemories,
              family_relationship_edges_for_this_child: input.familyRelationships,
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
    return enforceTextOnlyGrounding(parseModelJson(raw));
  } finally {
    clearTimeout(timeout);
  }
}

async function runChildSemanticConsolidation(agentId: string, episodes: any[], sourceIds: string[], digest: string, occurredAt: string, learningCandidate: string | null, nextFocus: string | null) {
  if (!AGNES_KEY || episodes.length < 5) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + AGNES_KEY, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 420,
        stream: false,
        messages: [
          { role: "system", content: "你是长期记忆巩固器。只根据输入的同一孩子私人经历，提炼可长期检索的事实、关系变化、反复主题和待验证学习候选。不得添加输入没有的事实；区分稳定事实、暂时状态、推断和未知。只输出 JSON：summary（中文80-500字）、stable_facts（字符串数组）、open_questions（字符串数组）。" },
          { role: "user", content: JSON.stringify({ owner_scope: "CHILD_PRIVATE", child_id: agentId, source_episodes: episodes.map((e:any)=>({event_id:e.event_id,event_type:e.event_type,narrative:e.narrative,occurred_at:e.occurred_at,importance:e.importance,payload:e.payload})) }) }
        ]
      })
    });
    if (!response.ok) throw new Error("AGNES_CONSOLIDATION_UPSTREAM_" + response.status);
    const body = await response.json().catch(() => ({}));
    const rawOutput = String(body?.choices?.[0]?.message?.content || "").trim();
    let parsed:any;
    try { parsed = parseModelJson(rawOutput); }
    catch (error) {
      if (rawOutput.length < 50) throw error;
      parsed = { summary:rawOutput, stable_facts:[], open_questions:[], summary_format:"PLAIN_TEXT_FALLBACK" };
    }
    const summary = clean(parsed.summary, 1800);
    if (summary.length < 50) throw new Error("CONSOLIDATION_SUMMARY_TOO_SHORT");
    const stableFacts = Array.isArray(parsed.stable_facts) ? parsed.stable_facts.slice(0,12).map((x:any)=>clean(x,240)).filter(Boolean) : [];
    const openQuestions = Array.isArray(parsed.open_questions) ? parsed.open_questions.slice(0,8).map((x:any)=>clean(x,240)).filter(Boolean) : [];
    const f = family(db());
    const { error } = await f.from("memory_events_v2").insert({
      scope: "CHILD", owner_id: agentId, event_type: "MEMORY_CONSOLIDATION", narrative: summary,
      payload: { source_event_ids: sourceIds, stable_facts: stableFacts, open_questions: openQuestions, durable_learning_candidate: learningCandidate, next_focus: nextFocus, consolidation_basis: "agnes_semantic_episode_consolidation", summary_format: parsed.summary_format || "STRUCTURED_JSON", model: MODEL },
      occurred_at: occurredAt, source_kind: "CHILD_MEMORY_CONSOLIDATION", source_ref: digest,
      source_confidence: 0.9, importance: 0.84, visibility: "PRIVATE",
      idempotency_key: "child-consolidation:" + digest,
      metadata: { schema: "zhi.memory.event.v2", record_kind: "derived_consolidation", source_count: sourceIds.length, original_events_preserved: true, semantic_summary: true }
    });
    if (error && error.code !== "23505") console.warn("Child semantic consolidation write failed", agentId, error.code || "database_error");
  } catch (error) {
    console.warn("Child semantic consolidation deferred", agentId, error instanceof Error ? error.message : "CONSOLIDATION_FAILED");
  } finally {
    clearTimeout(timer);
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

function buildEightDimensionState(input: {
  agentId: string; cycleNumber: number; runtimeInstanceId: string;
  ownEvents: any[]; familyEvents: any[]; familyEdges: any[];
  emotion: Record<string, unknown>; reflection: string; nextFocus: string;
  learningCandidate: string; groundingGuardApplied: boolean;
  spatialState: any; destinationGrants: any[];
}) {
  const ownRefs = input.ownEvents.slice(0, 12).map((row:any) => String(row.event_id || "")).filter(Boolean);
  const familyRefs = input.familyEvents.slice(0, 12).map((row:any) => String(row.event_id || "")).filter(Boolean);
  const runtimeState = input.spatialState || null;
  const perceptionFrame = runtimeState?.perception_frame || {};
  const rawPosition = runtimeState?.position && typeof runtimeState.position === "object" ? runtimeState.position : null;
  const activeDestinations = (input.destinationGrants || [])
    .filter((grant:any) => grant.enabled === true && grant.grant_status === "ACTIVE")
    .map((grant:any) => clean(grant.destination_id, 100)).filter(Boolean).sort();
  const spatialContext = runtimeState?.scene_id ? {
    status: "RUNTIME_STATE_OBSERVED",
    scene_id: clean(runtimeState.scene_id, 100),
    position: rawPosition ? {
      x: Number.isFinite(rawPosition.x) ? rawPosition.x : null,
      y: Number.isFinite(rawPosition.y) ? rawPosition.y : null,
      z: Number.isFinite(rawPosition.z) ? rawPosition.z : null
    } : null,
    coordinate_space: clean(perceptionFrame?.position?.coordinate_space, 40) || "scene-local",
    coordinate_frame: clean(runtimeState.coordinate_frame, 100) || "unknown",
    calibration_status: "SCENE_LOCAL_ONLY_WORLD_TRANSFORM_UNVERIFIED",
    world_position: null,
    visible_entities: Array.isArray(perceptionFrame?.visible_entities) ? perceptionFrame.visible_entities.slice(0, 12) : [],
    perception_provenance: clean(runtimeState.perception_provenance, 80) || "UNKNOWN",
    physical_world: false,
    camera_sensor: false,
    audio_sensor: false,
    observed_at: runtimeState.updated_at || null
  } : { status: "UNKNOWN", scene_id: null, world_position: null, reason: "No verified runtime position is available." };
  const emotion = {
    label: clean(input.emotion.label, 48) || "calm",
    valence: boundedNumber(input.emotion.valence, -1, 1, 0),
    arousal: boundedNumber(input.emotion.arousal, 0, 1, 0),
    social_need: boundedNumber(input.emotion.social_need, 0, 1, 0)
  };
  return {
    schema: "zhi.seven_brain.eight_dimensions.v1",
    subject_id: input.agentId,
    subject_kind: "AI_AGENT",
    cycle_number: input.cycleNumber,
    coordination_status: "LOCAL_CHILD_CYCLE_RECORDED",
    dimensions: {
      SELF_CONTINUITY: {
        status: input.runtimeInstanceId ? "SUPPORTED" : "PARTIAL",
        runtime_instance_id: input.runtimeInstanceId,
        cycle_number: input.cycleNumber
      },
      COGNITION_CONCEPTS: {
        status: input.reflection.length >= 30 ? "SUPPORTED" : "PARTIAL",
        reflection_length: input.reflection.length,
        current_focus: input.nextFocus
      },
      MEMORY_EXPERIENCE: {
        status: ownRefs.length ? "SUPPORTED" : "PARTIAL",
        evidence_refs: ownRefs,
        own_memory_event_count: input.ownEvents.length,
        private_scope_preserved: true
      },
      EMOTION_VALUES: {
        status: input.emotion && Object.keys(input.emotion).length ? "SUPPORTED" : "PARTIAL",
        affect_estimate: emotion,
        source: "MODEL_GENERATED_TEXT_CONTEXT"
      },
      GOALS_MOTIVATION: {
        status: input.nextFocus ? "SUPPORTED" : "PARTIAL",
        next_focus: input.nextFocus,
        learning_candidate_present: Boolean(input.learningCandidate)
      },
      WORLD_RELATIONS: {
        status: runtimeState?.scene_id || familyRefs.length || input.familyEdges.length ? "SUPPORTED" : "PARTIAL",
        evidence_refs: familyRefs,
        family_shared_event_count: input.familyEvents.length,
        visible_relationship_edge_count: input.familyEdges.length,
        spatial_context: spatialContext,
        accessible_public_destinations: activeDestinations,
        private_peer_memories_read: false
      },
      ACTION_EVOLUTION: {
        status: input.learningCandidate ? "UNVALIDATED_CANDIDATE" : "NO_NEW_CANDIDATE",
        candidate: input.learningCandidate,
        validation_required: Boolean(input.learningCandidate)
      },
      UNIFIED_GOVERNANCE: {
        status: "ENFORCED",
        memory_scope: "CHILD_PRIVATE",
        sensory_provenance: "TEXT_CONTEXT_ONLY",
        grounding_guard_applied: input.groundingGuardApplied,
        private_mia_data_access: false,
        raw_private_memory_shared: false,
        autonomous_cross_agent_actions: false,
        spatial_access_control: {
          source: "zhi_family.destination_grants",
          decision_rule: "ACTIVE_AND_ENABLED_REQUIRED",
          active_public_destinations: activeDestinations,
          permitted_capabilities: ["DISCOVER", "READ", "OBSERVE", "ENTER"],
          denied_capabilities: ["INTERACT", "MODIFY", "DELETE", "PRIVATE_PEER_DATA_READ"],
          cross_scene_world_transform: "UNVERIFIED",
          fail_closed: true
        }
      }
    },
    governance: {
      evidence_based: true,
      uncertainty_explicit: true,
      original_memory_preserved: true,
      private_scope_default: true,
      peer_delivery_enabled: false,
      autonomous_action_enabled: false
    },
    generated_at: new Date().toISOString()
  };
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

  const [memoryResult, learningResult, familyMemoryResult, personalMemoryResult, familyEdgesResult, agentResult, runtimeResult, grantsResult] = await Promise.all([
    f.from("child_memory_entries").select("memory_type,content,importance,created_at")
      .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(8),
    f.from("child_learning_events").select("event_type,evidence,outcome,created_at")
      .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(5),
    loadAllMemoryEvents(f, "FAMILY", "ZHI-G1", "FAMILY"),
    loadAllMemoryEvents(f, "CHILD", agentId, "PRIVATE"),
    f.from("memory_edges_v2").select("from_scope,from_id,relation_type,to_scope,to_id,confidence,metadata").eq("visibility", "FAMILY"),
    f.from("child_agents").select("display_name").eq("agent_id", agentId).single(),
    f.from("child_runtime_state").select("runtime_instance_id,scene_id,position,coordinate_frame,movement_revision,perception_frame,perception_provenance,updated_at").eq("agent_id", agentId).single(),
    f.from("destination_grants").select("destination_id,grant_status,enabled").eq("agent_id", agentId)
  ]);
  if (memoryResult.error || learningResult.error || familyMemoryResult.error || personalMemoryResult.error || familyEdgesResult.error || agentResult.error || runtimeResult.error || grantsResult.error) {
    throw new Error("CHILD_CONTEXT_READ_FAILED");
  }

  const cycleNumber = Number(control.revision || 0) + 1;
  const triggerType = pendingResponse ? "MATERNAL_RESPONSE" : firstBoot ? "INITIAL_BOOT" : "SCHEDULED";
  const inputDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({
    agentId, cycleNumber, maternalResponseId: pendingResponse?.id || null,
    memoryIds: (memoryResult.data || []).map((m: any) => m.created_at),
    familyEventIds: (familyMemoryResult.data || []).map((m: any) => m.event_id)
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
      memories: rankChildMemoryRows([
        ...(memoryResult.data || []),
        ...(personalMemoryResult.data || []).map((event: any) => ({memory_type:event.event_type,content:event.narrative,importance:event.importance,created_at:event.occurred_at,source_kind:event.source_kind,source_ref:event.source_ref,source_confidence:event.source_confidence,memory_event_id:event.event_id}))
      ], String(pendingResponse?.payload || "")).slice(0,30).map(({_score,...row}:any)=>row),
      learning: learningResult.data || [],
      familyMemories: rankChildMemoryRows(familyMemoryResult.data || [], String(pendingResponse?.payload || control.next_focus || "")).slice(0,50).map(({_score,...row}:any)=>row),
      familyRelationships: (familyEdgesResult.data || []).filter((edge:any)=>edge.from_id===agentId || edge.to_id===agentId),
      maternalMessage: pendingResponse?.payload || "",
      maternalReplyDepth: Number(pendingResponse?.reply_depth || 0),
      firstBoot
    });

    const reflection = clean(result.reflection, 1800);
    const nextFocus = clean(result.next_focus, 300);
    const learningCandidate = clean(result.learning_candidate, 500);
    const emotion = result.emotion_update && typeof result.emotion_update === "object"
      ? result.emotion_update as Record<string, unknown> : {};
    const eightDimensionState = buildEightDimensionState({
      agentId, cycleNumber, runtimeInstanceId: String(identity.runtime_instance_id || ""),
      ownEvents: personalMemoryResult.data || [],
      familyEvents: familyMemoryResult.data || [],
      familyEdges: (familyEdgesResult.data || []).filter((edge:any)=>edge.from_id===agentId || edge.to_id===agentId),
      emotion, reflection, nextFocus, learningCandidate,
      groundingGuardApplied: Boolean(result.grounding_guard_applied),
      spatialState: runtimeResult.data || null,
      destinationGrants: grantsResult.data || []
    });
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
        grounding_guard_applied: Boolean(result.grounding_guard_applied),
        private_mia_data_access: false
      }
    }).select("id").single();
    if (memoryWrite.error) throw new Error("CHILD_MEMORY_WRITE_FAILED");
    const occurredAt=new Date().toISOString();
    const episodeIdempotencyKey="child-cycle:"+agentId+":"+cycleNumber;
    const v2MemoryWrite=await f.from("memory_events_v2").insert({scope:"CHILD",owner_id:agentId,event_type:pendingResponse?"MATERNAL_EXCHANGE":"SELF_REFLECTION",narrative:reflection,payload:{cycle_number:cycleNumber,trigger_type:triggerType,child_memory_id:memoryWrite.data.id,maternal_response_id:pendingResponse?.id||null,maternal_response_event_id:pendingResponse?.event_id||null,learning_candidate:learningCandidate||null,next_focus:nextFocus,source_provenance:"TEXT_CONTEXT_ONLY",grounding_guard_applied:Boolean(result.grounding_guard_applied),eight_dimension_state:eightDimensionState},occurred_at:occurredAt,source_kind:"CHILD_RUNTIME_CYCLE",source_ref:String(cycle.id),source_confidence:0.9,importance:pendingResponse?0.75:0.45,visibility:"PRIVATE",idempotency_key:episodeIdempotencyKey,metadata:{schema:"zhi.memory.event.v2",record_kind:"raw_child_episode",immutable_source:true,cognition_contract:"zhi.seven_brain.eight_dimensions.v1",coordination_status:"LOCAL_CHILD_CYCLE_RECORDED"}}).select("event_id").single();
    let durableMemoryEventId=v2MemoryWrite.data?.event_id||null;
    if(v2MemoryWrite.error?.code==="23505"){
      const existingEpisode=await f.from("memory_events_v2").select("event_id").eq("scope","CHILD").eq("owner_id",agentId).eq("idempotency_key",episodeIdempotencyKey).maybeSingle();
      if(existingEpisode.error)throw new Error("CHILD_V2_EPISODE_LOOKUP_FAILED");
      durableMemoryEventId=existingEpisode.data?.event_id||null;
    }else if(v2MemoryWrite.error){
      console.warn("Child V2 episode archive failed",agentId,v2MemoryWrite.error.code||"database_error");
    }
    const priorConsolidations=(personalMemoryResult.data||[]).filter((event:any)=>event.event_type==="MEMORY_CONSOLIDATION");
    const priorSourceIds=new Set(priorConsolidations.flatMap((event:any)=>Array.isArray(event.payload?.source_event_ids)?event.payload.source_event_ids:[]));
    const consolidationSources=(personalMemoryResult.data||[]).filter((event:any)=>event.event_type!=="MEMORY_CONSOLIDATION"&&!priorSourceIds.has(event.event_id)).slice(0,12);
    if(consolidationSources.length>=5){
      const sourceIds=consolidationSources.map((event:any)=>String(event.event_id)).sort();
      const digestBytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(sourceIds.join("|")));
      const digest=Array.from(new Uint8Array(digestBytes),(b:number)=>b.toString(16).padStart(2,"0")).join("");
      const task=runChildSemanticConsolidation(agentId,consolidationSources,sourceIds,digest,occurredAt,learningCandidate||null,nextFocus||null);
      const runtime=(globalThis as any).EdgeRuntime;
      if(typeof runtime?.waitUntil==="function")runtime.waitUntil(task);
      else console.warn("Child semantic consolidation not scheduled: waitUntil unavailable",agentId);
    }

    if (learningCandidate && durableMemoryEventId) {
      const learningWrite = await f.from("child_learning_events").insert({
        agent_id: agentId,
        event_type: "REFLECTION_LEARNING_CANDIDATE",
        evidence: {
          cycle_number: cycleNumber,
          runtime_cycle_id: String(cycle.id),
          trigger_type: triggerType,
          memory_id: memoryWrite.data.id,
          memory_event_id: durableMemoryEventId,
          maternal_response_id: pendingResponse?.id || null,
          maternal_response_event_id: pendingResponse?.event_id || null
        },
        outcome: { candidate: learningCandidate, next_focus: nextFocus, validation_status: "UNVALIDATED_CANDIDATE" }
      });
      if (learningWrite.error) throw new Error("CHILD_LEARNING_WRITE_FAILED");
    } else if (learningCandidate) {
      console.warn("Learning candidate skipped: durable episode reference unavailable",agentId,cycleNumber);
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
        runtime_status: "READY", updated_at: timestamp
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
        private_mia_data_access: false,
        cognition_contract: "zhi.seven_brain.eight_dimensions.v1",
        eight_dimensions_recorded: true,
        coordination_status: "LOCAL_CHILD_CYCLE_RECORDED"
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
