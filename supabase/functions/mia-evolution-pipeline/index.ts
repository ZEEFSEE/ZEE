import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const IDENTITY_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
function decode(v: string) {
  const s = v.replace(/-/g, "+").replace(/_/g, "/");
  const b = atob(s + "=".repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function validToken(token: string) {
  try {
    if (!SERVICE_KEY) return false;
    const p = token.split(".");
    if (p.length !== 2) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, decode(p[1]), new TextEncoder().encode(p[0]))) return false;
    const c = JSON.parse(new TextDecoder().decode(decode(p[0])));
    const now = Math.floor(Date.now() / 1000);
    return c.aud === "mia-chat" && c.sub === "mia-admin" &&
      Number.isFinite(c.exp) && c.exp > now && Number.isFinite(c.iat) && c.iat <= now + 60;
  } catch { return false; }
}
const txt = (v: unknown, max = 1000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const types = new Set(["verified_insight", "stable_trait_upgrade", "soul_anchor", "core_principle"]);
const states = new Set(["candidate","evidence_check","stability_check","privacy_review","contradiction_check",
  "human_review","approved_for_shadow","shadow_observation","approved_for_release","committed",
  "deferred","rejected","blocked_source_health","blocked_privacy","blocked_conflict"]);
function thresholds(type: string) {
  if (type === "verified_insight") return { days: 14, count: 3, dates: 2 };
  if (type === "stable_trait_upgrade") return { days: 30, count: 5, dates: 3 };
  if (type === "soul_anchor") return { days: 7, count: 1, dates: 1 };
  return { days: 30, count: 1, dates: 1 };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || !await validToken(auth.slice(7))) return json({ error: "Unauthorized" }, 401);
  if (!URL || !SERVICE_KEY) return json({ error: "Database is not configured" }, 503);
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > 32000) return json({ error: "Request body too large" }, 413);
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request" }, 400);
  const action = txt(body.action, 40);
  const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  if (action === "validate_submit") {
    const geneType = txt(body.gene_type, 40);
    const pointer = txt(body.memory_pointer, 200);
    const scope = txt(body.source_scope, 100);
    const mark = Date.parse(txt(body.explicit_marked_at, 80));
    const valid = types.has(geneType) && pointer.length >= 8 && scope.length > 0 && Number.isFinite(mark) &&
      mark <= Date.now() && txt(body.idempotency_key, 200).length >= 8;
    return json({ ok: valid, validated: valid, persisted: false, dry_run: true,
      note: "Source pointers, evidence, privacy, and contradictions are not independently verified by this dry run." }, valid ? 200 : 400);
  }

  if (action === "submit") {
    const geneType = txt(body.gene_type, 40);
    const pointer = txt(body.memory_pointer, 200);
    const scope = txt(body.source_scope, 100);
    const markedAt = Date.parse(txt(body.explicit_marked_at, 80));
    const key = txt(body.idempotency_key, 200);
    const allowedTables = new Set(["mia_memories", "mia_life_events", "mia_emotion_events"]);
    const pointerValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pointer);
    if (!types.has(geneType) || !pointerValid || !allowedTables.has(scope) || !Number.isFinite(markedAt) ||
        markedAt > Date.now() || key.length < 8) return json({ error: "Candidate validation failed" }, 400);
    const insert = await db.from("mia_evolution_candidates").insert({
      identity_id: IDENTITY_ID, gene_type: geneType, memory_pointer: pointer, source_scope: scope,
      explicit_marked_at: new Date(markedAt).toISOString(), idempotency_key: key,
      fact_summary: txt(body.fact_summary, 600), interpretation_summary: txt(body.interpretation_summary, 600),
      emotion_summary: txt(body.emotion_summary, 400),
      metadata: { intake: "mia-evolution-pipeline", schema_version: "1.1", privacy_review_required: true },
    }).select("candidate_id,gene_type,state,explicit_marked_at,created_at,idempotency_key").single();
    if (insert.error?.code === "23505") {
      const existing = await db.from("mia_evolution_candidates")
        .select("candidate_id,gene_type,state,explicit_marked_at,created_at,idempotency_key")
        .eq("idempotency_key", key).maybeSingle();
      if (existing.data) return json({ ok: true, duplicate: true, candidate: existing.data });
    }
    if (insert.error || !insert.data) {
      console.error("Mia evolution candidate intake failed", insert.error?.code || "unknown");
      return json({ error: "Candidate was not confirmed as saved" }, 500);
    }
    return json({ ok: true, created: true, candidate: insert.data });
  }

  if (action === "list") {
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 20));
    const { data, error } = await db.from("mia_evolution_candidates")
      .select("candidate_id,gene_id,gene_type,state,memory_pointer,source_scope,explicit_marked_at,evidence_count,distinct_observation_dates,source_verification_status,duplicate_check_status,contradiction_check_status,privacy_review_status,shadow_eval_status,reviewer_decision,created_at,updated_at")
      .eq("identity_id", IDENTITY_ID).order("created_at", { ascending: false }).limit(limit);
    if (error) return json({ error: "Unable to read candidate queue" }, 500);
    return json({ ok: true, candidates: data || [] });
  }

  const candidateId = txt(body.candidate_id, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId))
    return json({ error: "Valid candidate_id required" }, 400);
  const found = await db.from("mia_evolution_candidates").select("*")
    .eq("candidate_id", candidateId).eq("identity_id", IDENTITY_ID).maybeSingle();
  if (found.error || !found.data) return json({ error: "Candidate not found" }, 404);
  const c = found.data;

  if (action === "verify_source") {
    const scope = txt(body.source_scope || c.source_scope, 100);
    const pointer = txt(body.memory_pointer || c.memory_pointer, 200);
    const allowedTables = new Set(["mia_memories", "mia_life_events", "mia_emotion_events"]);
    if (!allowedTables.has(scope) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pointer)) {
      return json({ error: "Source scope must be an allowlisted Mia table and pointer must be a record UUID." }, 400);
    }
    let query;
    if (scope === "mia_memories") {
      query = await db.from(scope).select("id,identity_id,occurred_at,created_at,memory_type").eq("id", pointer).eq("identity_id", IDENTITY_ID).maybeSingle();
    } else if (scope === "mia_life_events") {
      query = await db.from(scope).select("id,identity_id,occurred_at,created_at,event_type").eq("id", pointer).eq("identity_id", IDENTITY_ID).maybeSingle();
    } else {
      query = await db.from(scope).select("id,identity_id,occurred_at,created_at,emotion_type").eq("id", pointer).eq("identity_id", IDENTITY_ID).maybeSingle();
    }
    if (query.error) {
      console.error("Mia evolution source verification query failed", query.error.code || "unknown");
      return json({ error: "Source verification query failed; no verification was recorded." }, 500);
    }
    if (!query.data) {
      await db.from("mia_evolution_candidates").update({
        source_verification_status: "failed", source_verified_by: "system:source-resolver",
        source_verified_at: new Date().toISOString(),
        reviewer_decision: "Source resolver: pointer not found in the claimed table for Mia identity."
      }).eq("candidate_id", candidateId).eq("state", c.state);
      return json({ ok: false, verified: false, reason: "Pointer not found in the claimed source table for Mia identity." }, 404);
    }
    const occurred = query.data.occurred_at || query.data.created_at;
    const verifiedAt = new Date().toISOString();
    const upd = await db.from("mia_evolution_candidates").update({
      source_scope: scope, memory_pointer: pointer, source_verification_status: "verified",
      source_verified_by: "system:source-resolver", source_verified_at: verifiedAt,
      observation_window_start: occurred || c.observation_window_start,
      observation_window_end: occurred || c.observation_window_end,
      evidence_count: Math.max(Number(c.evidence_count) || 0, 1),
      distinct_observation_dates: Math.max(Number(c.distinct_observation_dates) || 0, occurred ? 1 : 0),
      reviewer_decision: "Source resolver verified the record exists and belongs to Mia; content was not copied into the candidate queue."
    }).eq("candidate_id", candidateId).eq("state", c.state)
      .select("candidate_id,state,source_scope,source_verification_status,source_verified_at,evidence_count,distinct_observation_dates,observation_window_start,observation_window_end").maybeSingle();
    if (upd.error || !upd.data) return json({ error: "Source verification could not be recorded; reload candidate." }, 409);
    return json({ ok: true, verified: true, candidate: upd.data,
      source: { table: scope, record_exists: true, identity_matches: true, timestamp_available: !!occurred },
      note: "Only pointer existence and identity were verified. This is one evidence item, not proof of a stable trait." });
  }

  if (action === "automated_checks") {
    const summaries = [txt(c.fact_summary,600), txt(c.interpretation_summary,600), txt(c.emotion_summary,400)].filter(Boolean);
    const joined = summaries.join("\n");
    const piiPatterns = [
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      /(?:\+?\d[\s().-]*){8,}/,
      /(?:api[_-]?key|service[_-]?role|password|secret)\s*[:=]\s*\S+/i,
      /https?:\/\/[^\s]+/i
    ];
    const privacyFlag = piiPatterns.some(re => re.test(joined));
    const normalize = (v: string) => v.toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu," ").trim();
    const normalized = summaries.map(normalize).filter(v=>v.length>=20);
    let duplicate = false;
    if (normalized.length) {
      const { data: others, error } = await db.from("mia_evolution_candidates")
        .select("candidate_id,fact_summary,interpretation_summary,emotion_summary")
        .eq("identity_id", IDENTITY_ID).eq("gene_type", c.gene_type).neq("candidate_id", candidateId).limit(50);
      if (error) return json({ error: "Duplicate pre-check failed; no check results saved." }, 500);
      const existing = (others||[]).flatMap((o:any)=>[txt(o.fact_summary,600),txt(o.interpretation_summary,600),txt(o.emotion_summary,400)]).map(normalize).filter(v=>v.length>=20);
      duplicate = normalized.some(v=>existing.includes(v));
    }
    const upd = await db.from("mia_evolution_candidates").update({
      privacy_review_status: privacyFlag ? "failed" : "passed",
      duplicate_check_status: duplicate ? "failed" : "passed",
      reviewer_decision: privacyFlag
        ? "Automated privacy pre-check flagged possible personal/contact/secret/URL content. Human review required; candidate must not advance."
        : duplicate
          ? "Automated exact-text duplicate pre-check found a matching normalized summary. Human review required."
          : "Automated pre-check found no obvious PII pattern or exact normalized duplicate; semantic privacy and contradiction review still required."
    }).eq("candidate_id", candidateId).eq("state", c.state)
      .select("candidate_id,state,privacy_review_status,duplicate_check_status,contradiction_check_status,reviewer_decision").maybeSingle();
    if (upd.error || !upd.data) return json({ error: "Automated pre-check results were not saved; reload candidate." }, 409);
    return json({ ok: true, candidate: upd.data, checks: {
      privacy_pattern_scan: privacyFlag ? "flagged" : "no_obvious_pattern",
      exact_normalized_duplicate_scan: duplicate ? "match_found" : "no_exact_match",
      semantic_privacy_review: "not_automated",
      contradiction_review: "not_automated"
    }});
  }

  if (action === "evidence_review") {
    const count = Number(body.evidence_count), dates = Number(body.distinct_observation_dates);
        const reviewer = txt(body.reviewer_id, 100);
    const start = body.observation_window_start ? Date.parse(txt(body.observation_window_start, 80)) : null;
    const end = body.observation_window_end ? Date.parse(txt(body.observation_window_end, 80)) : null;
    if (!Number.isInteger(count) || count < 0 || !Number.isInteger(dates) || dates < 0 ||
        !reviewer || (start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end)) ||
        (start !== null && end !== null && start > end)) return json({ error: "Evidence review fields invalid" }, 400);
    const patch: any = { evidence_count: count, distinct_observation_dates: dates,
            observation_window_start: start === null ? null : new Date(start).toISOString(),
      observation_window_end: end === null ? null : new Date(end).toISOString(),
      reviewer_decision: txt(body.review_summary, 800) || "Human evidence review recorded; source pointer verification remains separate." };
    const upd = await db.from("mia_evolution_candidates").update(patch).eq("candidate_id", candidateId)
      .select("candidate_id,state,evidence_count,distinct_observation_dates,source_verification_status,source_verified_at").single();
    if (upd.error) return json({ error: "Evidence review was not saved" }, 500);
    return json({ ok: true, candidate: upd.data, note: "Evidence verification is a human attestation; the endpoint does not independently resolve the opaque pointer." });
  }

  if (action === "review_checks") {
    const patch: any = {};
    for (const field of ["privacy_review_status","duplicate_check_status","contradiction_check_status"]) {
      if (body[field] !== undefined) {
        const value = txt(body[field], 30);
        if (!["pending","passed","failed"].includes(value)) return json({ error: "Invalid review status: " + field }, 400);
        patch[field] = value;
      }
    }
    if (body.reviewer_decision !== undefined) patch.reviewer_decision = txt(body.reviewer_decision, 800);
    if (body.reviewer_id !== undefined) patch.reviewer_id = txt(body.reviewer_id, 100);
    if (body.reviewed_at !== undefined) {
      const t = Date.parse(txt(body.reviewed_at, 80));
      if (!Number.isFinite(t)) return json({ error: "Invalid reviewed_at" }, 400);
      patch.reviewed_at = new Date(t).toISOString();
    }
    if (!Object.keys(patch).length) return json({ error: "No review fields supplied" }, 400);
    const upd = await db.from("mia_evolution_candidates").update(patch).eq("candidate_id", candidateId)
      .select("candidate_id,state,privacy_review_status,duplicate_check_status,contradiction_check_status,reviewer_decision,reviewer_id,reviewed_at").single();
    if (upd.error) return json({ error: "Review checks were not saved" }, 500);
    return json({ ok: true, candidate: upd.data });
  }

  if (action === "shadow_result") {
    const status = txt(body.shadow_eval_status, 30);
    const version = txt(body.shadow_eval_version, 100);
    const summary = txt(body.shadow_eval_summary, 1200);
    if (!["passed","failed","inconclusive"].includes(status) || !version || !summary || !txt(body.reviewer_id, 100))
      return json({ error: "Shadow result requires status, evaluation version, summary, and reviewer_id" }, 400);
    const upd = await db.from("mia_evolution_candidates").update({
      shadow_eval_status: status, shadow_eval_version: version, shadow_eval_summary: summary,
      reviewer_id: txt(body.reviewer_id, 100), reviewed_at: new Date().toISOString(),
      reviewer_decision: "Shadow evaluation recorded: " + status,
    }).eq("candidate_id", candidateId).select("candidate_id,state,shadow_eval_status,shadow_eval_version,shadow_eval_summary").single();
    if (upd.error) return json({ error: "Shadow result was not saved" }, 500);
    return json({ ok: true, candidate: upd.data, note: "This records an evaluation result; it does not execute the shadow evaluator." });
  }

  if (action === "transition") {
    const next = txt(body.to_state, 40);
    const reason = txt(body.reason, 800);
    if (!states.has(next) || !reason) return json({ error: "Valid to_state and reason required" }, 400);
    const gate = (condition: boolean, message: string) => condition ? null : message;
    let blocked: string | null = null;
    if (next === "stability_check") {
      const t = thresholds(c.gene_type);
      blocked = gate(c.source_verification_status === "verified" && c.evidence_count >= t.count &&
        c.distinct_observation_dates >= t.dates, "Verified source evidence does not meet the category minimum.");
    } else if (next === "privacy_review") {
      const t = thresholds(c.gene_type);
      blocked = gate(c.source_verification_status === "verified" &&
        Date.now() - Date.parse(c.explicit_marked_at) >= t.days * 86400000, "Source verification or minimum stability/reflection period has not passed.");
    } else if (next === "contradiction_check") {
      blocked = gate(c.privacy_review_status === "passed", "Privacy review must pass first.");
    } else if (next === "human_review") {
      blocked = gate(c.duplicate_check_status === "passed" && c.contradiction_check_status === "passed",
        "Duplicate and contradiction checks must both pass.");
    } else if (next === "approved_for_shadow") {
      blocked = gate(c.reviewer_decision && /approved/i.test(c.reviewer_decision) && !!c.reviewer_id && !!c.reviewed_at,
        "Explicit human approval with reviewer and timestamp is required.");
    } else if (next === "approved_for_release") {
      blocked = gate(c.shadow_eval_status === "passed" && c.reviewer_decision && /approved/i.test(c.reviewer_decision) && !!c.reviewer_id,
        "A passed shadow evaluation and separate explicit human approval are required.");
    } else if (next === "committed") {
      blocked = "This endpoint cannot publish or verify a GitHub gene commit; committed state is intentionally disabled until a separate verified release workflow exists.";
    }
    if (blocked) return json({ error: "Transition blocked", reason: blocked, state: c.state, requested_state: next }, 409);
    const patch: any = { state: next, reviewer_decision: reason };
    if (next === "approved_for_release") { patch.release_approved_by = txt(body.reviewer_id, 100); patch.released_at = new Date().toISOString(); }
    const upd = await db.from("mia_evolution_candidates").update(patch)
      .eq("candidate_id", candidateId).eq("state", c.state)
      .select("candidate_id,gene_type,state,updated_at,reviewer_decision").maybeSingle();
    if (upd.error) return json({ error: "State transition was not saved" }, 500);
    if (!upd.data) return json({ error: "Candidate state changed concurrently; reload and retry" }, 409);
    return json({ ok: true, candidate: upd.data, note: "State transitions are logged by the database trigger. This pipeline does not activate genes in mia-chat." });
  }

  return json({ error: "Unknown action" }, 400);
});
