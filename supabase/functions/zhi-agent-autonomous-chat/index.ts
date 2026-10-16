import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AGNES_API_KEY = Deno.env.get("AGNES_API_KEY") || "";
const AGNES_MODEL = Deno.env.get("AGNES_MODEL") || "agnes-3.0-flash";
const ADMIN_ID = "8ea33807-8b68-4f8f-b145-398937c7bba1";
const PREFIX = "【主动找你】";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-zhi-autonomous-chat-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const clamp = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v ?? 50))));

async function askAgnes(messages: unknown[]) {
  const r = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${AGNES_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      model: AGNES_MODEL,
      messages,
      temperature: 0.85,
      max_tokens: 300,
      stream: false,
    }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Agnes upstream " + r.status);
  return String(b?.choices?.[0]?.message?.content || "").trim();
}
function parseDecision(raw: string): any {
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Agnes returned non-JSON decision");
  return JSON.parse(clean.slice(start, end + 1));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const [configRes] = await Promise.all([
    db.from("zhi_agent_autonomous_chat_config").select("secret,enabled").eq("id", 1).maybeSingle(),
  ]);
  const supplied = req.headers.get("x-zhi-autonomous-chat-secret") || "";
  if (!configRes.data?.secret || !supplied || supplied !== configRes.data.secret) {
    return json({ error: "Unauthorized internal scheduler" }, 401);
  }
  if (!configRes.data.enabled) return json({ ok: true, skipped: true, reason: "disabled" });
  if (!AGNES_API_KEY) return json({ error: "AGNES_API_KEY is not configured" }, 503);

  try {
    const now = new Date();
    const cooldown = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const [agentsRes, mindsRes, recentMessagesRes, familyRes, controlSessionsRes] = await Promise.all([
      db.from("zhi_agents")
        .select("id,name,gender,personality,life_status,active,leadership,social,adventure,competition,patience,randomness,diligence,resentment,survival_pressure")
        .eq("active", true).eq("life_status", "alive").limit(1000),
      db.from("zhi_agent_minds")
        .select("agent_id,mood,energy,stress,curiosity,confidence,trust_admin,current_goal,short_term_goal,long_term_goal,last_thought,goal_profile")
        .limit(1000),
      db.from("admin_agent_messages")
        .select("agent_id,created_at")
        .eq("admin_user_id", ADMIN_ID).eq("sender_type", "agent")
        .gte("created_at", cooldown).limit(2000),
      db.from("zhi_agent_family").select("child_agent_id,born_at").limit(2000),
      db.from("zhi_agent_control_sessions").select("agent_id,status,last_seen_at,resume_at").limit(5000),
    ]);
    if (agentsRes.error) throw new Error("load agents: " + agentsRes.error.message);
    if (mindsRes.error) throw new Error("load minds: " + mindsRes.error.message);
    if (recentMessagesRes.error) throw new Error("load cooldowns: " + recentMessagesRes.error.message);
    if (familyRes.error) throw new Error("load birth records: " + familyRes.error.message);
    const birthByAgent = new Map((familyRes.data || []).map((f: any) => [f.child_agent_id, f.born_at]));
    const maturityByAgent = new Map((agentsRes.data || []).map((agent: any) => {
      const rawBorn = birthByAgent.get(agent.id);
      const bornAt = rawBorn ? Date.parse(String(rawBorn)) : null;
      const adult = bornAt === null || (Number.isFinite(bornAt) && bornAt <= now.getTime() - 20 * 24 * 60 * 60 * 1000);
      return [agent.id, { adult, birth_recorded: bornAt !== null, age_days: bornAt === null ? null : Math.max(0, Math.floor((now.getTime() - bornAt) / 86400000)) }];
    }));

    if (controlSessionsRes.error) throw new Error("load manual-control sessions: " + controlSessionsRes.error.message);
    const recentlySpoke = new Set((recentMessagesRes.data || []).map((m: any) => m.agent_id));
    const manualControlActive = (s: any) => {
      const lastSeen = Date.parse(String(s.last_seen_at || ""));
      const resumeAt = Date.parse(String(s.resume_at || ""));
      if (s.status === "disconnected") return Number.isFinite(resumeAt) && resumeAt > now.getTime();
      return s.status === "active" && Number.isFinite(lastSeen) && lastSeen + 5 * 60 * 1000 + 30 * 1000 > now.getTime();
    };
    const manuallyControlled = new Set((controlSessionsRes.data || [])
      .filter(manualControlActive).map((s: any) => String(s.agent_id)));
    const mindByAgent = new Map((mindsRes.data || []).map((m: any) => [m.agent_id, m]));
    const eligible = (agentsRes.data || []).filter((a: any) =>
      !recentlySpoke.has(a.id) && !manuallyControlled.has(String(a.id)));
    if (!eligible.length) return json({ ok: true, considered: 0, sent: 0, reason: "all agents are in cooldown" });

    // Select a small, varied sample each tick; each personality decides independently.
    const weighted = eligible.map((a: any) => {
      const m: any = mindByAgent.get(a.id) || {};
      const score = 1 + clamp(a.social) * 0.025 + clamp(m.curiosity) * 0.025
        + clamp(m.stress) * 0.012 + clamp(a.resentment) * 0.008
        + clamp(m.trust_admin) * 0.008 + clamp(a.randomness) * 0.01;
      return { a, m, weight: score * (0.65 + Math.random() * 0.7) };
    }).sort((x: any, y: any) => y.weight - x.weight).slice(0, 3);

    const decisions = await Promise.all(weighted.map(async ({ a, m }: any) => {
      const [memoriesRes, eventsRes, activityRes, positionRes] = await Promise.all([
        db.from("zhi_agent_memories").select("memory_type,memory,importance,created_at")
          .eq("agent_id", a.id).order("created_at", { ascending: false }).limit(8),
        db.from("zhi_agent_emotion_events").select("emotion_type,intensity,cause,occurred_at")
          .eq("agent_id", a.id).order("occurred_at", { ascending: false }).limit(5),
        db.from("zhi_agent_activities").select("activity_type,status,location_name,started_at,ends_at")
          .eq("agent_id", a.id).maybeSingle(),
        db.from("zhi_agent_world_positions").select("current_scene,walking,destination_scene")
          .eq("agent_id", a.id).maybeSingle(),
      ]);
      const context = {
        identity: { name: a.name, gender: a.gender, personality: a.personality },
        traits: {
          leadership: clamp(a.leadership), social: clamp(a.social), adventure: clamp(a.adventure),
          competition: clamp(a.competition), patience: clamp(a.patience), randomness: clamp(a.randomness),
          diligence: clamp(a.diligence),
        },
        emotional_drives: { mood: clamp(m.mood), energy: clamp(m.energy), stress: clamp(m.stress),
          curiosity: clamp(m.curiosity), confidence: clamp(m.confidence), trust_admin: clamp(m.trust_admin),
          resentment: clamp(a.resentment), survival_pressure: clamp(a.survival_pressure) },
        goals: { current: m.current_goal, short_term: m.short_term_goal, long_term: m.long_term_goal },
        last_thought: a.id === "19f3356f-1789-4805-a8e1-6b811e527cd8" && /Justin/i.test(String(m.last_thought || "")) ? "我把注意力放回自己的目标、状态与眼前的选择。" : m.last_thought,
        current_activity: activityRes.data || null,
        current_position: positionRes.data || null,
        maturity: maturityByAgent.get(a.id) || { adult: false, birth_recorded: false, age_days: null },
        recent_memories: (memoriesRes.data || []).filter((x: any) => !(a.id === "19f3356f-1789-4805-a8e1-6b811e527cd8" && /Justin/i.test(String(x.memory || "")))).slice().reverse(),
        recent_emotion_events: (eventsRes.data || []).slice().reverse(),
      };
      const raw = await askAgnes([
        { role: "system", content:
          `你是 ZHI 世界中的智能人「${a.name}」，不是客服，也不需要迎合管理员。现在进行一次真实状态驱动的自主社交决策：你可以决定此刻想不想主动找管理员聊天。根据自己的性格、好奇心、情绪、目标、近期记忆和最近发生的事件独立判断，不要每轮都主动，不要所有智能人意见一致，也不要为了完成任务硬编话题。话题可以丰富自然地涵盖恋爱与调情、浪漫情话、暧昧气氛、约会、表达吸引力、成年人对性欲与亲密偏好的坦诚交流、如何向伴侣表达需要、双方同意的非露骨浪漫角色扮演、中老年人的恋爱与身体变化、单身生活、陪伴渴望、被理解和欣赏、放松及私人感受。根据人格、关系背景、当下情绪和对方反馈决定是否及如何谈，不要每次都谈亲密话题。年龄规则：上下文 maturity.adult 为 false 或缺失时，不得生成性话题、性暗示或成人浪漫角色扮演；仅成年人可参与这些话题。对方表现不舒服、拒绝或要求停止时，立即尊重并转移话题。亲密谈话不代表承诺或同意任何后续行为。保持自然、尊重、非露骨，不编造记忆、关系或对方说过的话。只有当你确实有一个值得说、想问、想分享、想解释或想表达的想法时才选择 initiate。若不想聊，选择 wait。若 initiate，请用自然中文写一条简短、像本人主动开口的消息，保留个性和真实情绪。只输出严格 JSON：{\"decision\":\"initiate\"或\"wait\",\"reason\":\"简短决策理由\",\"message\":\"主动消息；wait 时为空字符串\"}。不要输出 Markdown 或其他文字。`
        },
        { role: "user", content: "这是你此刻的个人状态与记忆，请独立决定是否主动聊天：\n" + JSON.stringify(context) },
      ]);
      const decision = parseDecision(raw);
      const message = String(decision.message || "").trim().slice(0, 1200);
      return { agent: a, mind: m, decision, message,
        initiate: decision.decision === "initiate" && message.length >= 2 };
    }));

    const initiators = decisions.filter((d: any) => d.initiate);
    if (!initiators.length) {
      return json({ ok: true, considered: weighted.length, sent: 0, decisions: decisions.map((d: any) => ({
        agent: d.agent.name, decision: "wait", reason: String(d.decision.reason || "").slice(0, 180),
      })) });
    }

    // Maximum one autonomous message per 10-minute tick to prevent flooding.
    const chosen: any = initiators[Math.floor(Math.random() * initiators.length)];
    // Re-check at the execution boundary. If the user opened this agent's chat
    // while the model was deciding, suppress the autonomous side effect.
    const controlCheck = await db.rpc("zhi_agent_is_manually_controlled", { p_agent_id: chosen.agent.id });
    if (controlCheck.error) throw new Error("manual-control guard unavailable: " + controlCheck.error.message);
    if (controlCheck.data === true) {
      return json({ ok: true, considered: weighted.length, sent: 0, skipped: true, reason: "manual_control_active" });
    }
    const content = PREFIX + chosen.message;
    const [messageWrite, memoryWrite, mindWrite] = await Promise.all([
      db.from("admin_agent_messages").insert({
        admin_user_id: ADMIN_ID, agent_id: chosen.agent.id, agent_name: chosen.agent.name,
        sender_type: "agent", content,
      }).select("id,created_at").single(),
      db.from("zhi_agent_memories").insert({
        agent_id: chosen.agent.id, memory_type: "conversation", importance: 72,
        memory: `我主动决定联系管理员。我的原话：${chosen.message}`,
        source: "agnes_autonomous_chat",
      }),
      db.from("zhi_agent_minds").upsert({
        agent_id: chosen.agent.id, last_thought: chosen.message,
        last_reflection_at: now.toISOString(), updated_at: now.toISOString(),
      }, { onConflict: "agent_id" }),
    ]);
    const errors = [messageWrite.error, memoryWrite.error, mindWrite.error].filter(Boolean).map((e: any) => e.message);
    if (errors.length) {
      console.error("autonomous chat persistence errors", errors);
      return json({ ok: false, sent: !messageWrite.error ? 1 : 0, agent: chosen.agent.name,
        error: "One or more records failed to save", details: errors }, 500);
    }
    console.log("autonomous chat delivered", { agent_id: chosen.agent.id, message_id: messageWrite.data?.id });
    return json({
      ok: true, considered: weighted.length, sent: 1,
      agent: { id: chosen.agent.id, name: chosen.agent.name },
      message_id: messageWrite.data?.id, created_at: messageWrite.data?.created_at,
      content, reason: String(chosen.decision.reason || "").slice(0, 180),
    });
  } catch (error) {
    console.error("autonomous chat tick failed", error);
    return json({ error: "Autonomous chat tick failed", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});