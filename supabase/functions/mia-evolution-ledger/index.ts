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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function decode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function validToken(token: string) {
  try {
    if (!SERVICE_KEY) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SERVICE_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (!await crypto.subtle.verify(
      "HMAC", key, decode(parts[1]), new TextEncoder().encode(parts[0]),
    )) return false;
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return claims.aud === "mia-chat" && claims.sub === "mia-admin" &&
      Number.isFinite(claims.exp) && claims.exp > now &&
      Number.isFinite(claims.iat) && claims.iat <= now + 60;
  } catch {
    return false;
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ") ||
      !await validToken(authorization.slice(7))) {
    return json({ error: "未授权，请重新验证 Mia 页面密码。" }, 401);
  }
  if (!URL || !SERVICE_KEY) return json({ error: "Mia database is not configured." }, 503);

  const length = Number(req.headers.get("content-length") || 0);
  if (length > 32_000) return json({ error: "Request body too large." }, 413);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const action = cleanText(body.action, 20);
  const geneId = cleanText(body.gene_id, 160);
  const attemptedVersion = Number(body.attempted_version);
  const rollbackToVersion = Number(body.rollback_to_version);
  const attemptedCommit = cleanText(body.attempted_commit, 160);
  const rollbackToCommit = cleanText(body.rollback_to_commit, 160);
  const detectedAt = cleanText(body.detected_at, 80);
  const category = cleanText(body.conflict_category, 40);
  const scenario = cleanText(body.scenario_summary, 1200);
  const decision = cleanText(body.decision, 800);
  const outcome = cleanText(body.rollback_outcome, 30);
  const idempotencyKey = cleanText(body.idempotency_key, 200);
  const allowedCategories = new Set([
    "behavioral_conflict", "logic_conflict", "regression",
    "safety_conflict", "context_mismatch", "other",
  ]);
  const allowedOutcomes = new Set(["rolled_back", "rollback_failed", "rollback_pending"]);
  const expectedObserved = body.expected_vs_observed;
  const evidencePointers = body.evidence_pointers;
  const correctionOf = body.correction_of == null ? null : cleanText(body.correction_of, 80);

  const valid = geneId.length > 0 &&
    Number.isInteger(attemptedVersion) && attemptedVersion >= 1 &&
    Number.isInteger(rollbackToVersion) && rollbackToVersion >= 1 &&
    attemptedCommit.length > 0 && rollbackToCommit.length > 0 &&
    Number.isFinite(Date.parse(detectedAt)) &&
    allowedCategories.has(category) && scenario.length > 0 && decision.length > 0 &&
    allowedOutcomes.has(outcome) && idempotencyKey.length >= 8 &&
    expectedObserved && typeof expectedObserved === "object" &&
    !Array.isArray(expectedObserved) &&
    (evidencePointers === undefined ||
      (Array.isArray(evidencePointers) && evidencePointers.length <= 20 &&
        evidencePointers.every((v: unknown) => typeof v === "string" &&
          v.length > 0 && v.length <= 200))) &&
    (correctionOf === null ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correctionOf));

  if (!valid) {
    return json({
      error: "Rollback event validation failed.",
      required: [
        "gene_id", "attempted_version", "attempted_commit",
        "rollback_to_version", "rollback_to_commit", "detected_at",
        "conflict_category", "scenario_summary", "expected_vs_observed",
        "decision", "rollback_outcome", "idempotency_key",
      ],
    }, 400);
  }

  if (action === "validate") {
    return json({ ok: true, validated: true, persisted: false, dry_run: true });
  }
  if (action !== "record") return json({ error: "action must be validate or record." }, 400);

  const db = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const row = {
    identity_id: IDENTITY_ID,
    event_type: "Evolution_Rollback_Event",
    gene_id: geneId,
    attempted_version: attemptedVersion,
    attempted_commit: attemptedCommit,
    rollback_to_version: rollbackToVersion,
    rollback_to_commit: rollbackToCommit,
    detected_at: new Date(detectedAt).toISOString(),
    conflict_category: category,
    scenario_summary: scenario,
    expected_vs_observed: expectedObserved,
    evidence_pointers: evidencePointers || [],
    decision,
    rollback_outcome: outcome,
    idempotency_key: idempotencyKey,
    correction_of: correctionOf,
    metadata: { source: "mia-evolution-ledger", schema_version: "1.0" },
  };

  const inserted = await db.from("mia_evolution_rollback_events")
    .insert(row)
    .select("event_id,event_type,gene_id,attempted_version,rollback_to_version,rollback_outcome,idempotency_key,created_at")
    .single();

  if (inserted.error?.code === "23505") {
    const existing = await db.from("mia_evolution_rollback_events")
      .select("event_id,event_type,gene_id,attempted_version,rollback_to_version,rollback_outcome,idempotency_key,created_at")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing.data) {
      return json({ ok: true, persisted: true, duplicate: true, event: existing.data });
    }
  }
  if (inserted.error || !inserted.data) {
    console.error("Mia rollback event persistence failed", inserted.error?.message || "unknown");
    return json({ error: "Rollback event was not confirmed as persisted." }, 500);
  }
  return json({ ok: true, persisted: true, duplicate: false, event: inserted.data });
});
