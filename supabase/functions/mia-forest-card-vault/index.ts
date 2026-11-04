import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const IDENTITY_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_SOURCE_REFS = 12;
const MAX_CARD_BYTES = 12 * 1024;
const ALLOWED_CATEGORIES = new Set([
  "comfort_anchor", "shared_decision", "emotion_residue", "life_event",
  "reflection", "creative_seed", "relationship_context", "scene_build_progress",
]);
const SOURCE_TABLES = new Set([
  "mia_messages", "mia_memories", "mia_emotion_events",
  "mia_life_events", "mia_relationship_context",
]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const encoder = new TextEncoder();

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
async function validMiaToken(token: string): Promise<boolean> {
  try {
    if (!SERVICE_KEY || token.length > 4096) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    if (!await crypto.subtle.verify("HMAC", key, decodeBase64Url(parts[1]), encoder.encode(parts[0]))) return false;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return claims?.aud === "mia-chat"
      && claims?.sub === "mia-admin"
      && Number.isFinite(claims.exp)
      && Number.isFinite(claims.iat)
      && claims.exp > now
      && claims.iat <= now + 60
      && claims.iat >= now - 4 * 60 * 60 - 60
      && claims.exp - claims.iat <= 4 * 60 * 60 + 60;
  } catch {
    return false;
  }
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort().map((key) =>
    JSON.stringify(key) + ":" + canonical(object[key])
  ).join(",") + "}";
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function hasAuroraMarker(row: Record<string, unknown>): boolean {
  const text = canonical(row).toLowerCase();
  return /aurora|federat|public[-_ ]chat|world[-_ ]runtime/.test(text);
}
function sourceTimestamp(table: string, row: Record<string, unknown>): string {
  const candidate = table === "mia_relationship_context"
    ? row.observed_at
    : row.occurred_at ?? row.created_at;
  if (typeof candidate !== "string" || !Number.isFinite(Date.parse(candidate))) {
    throw new Error("source_timestamp_unavailable");
  }
  return new Date(candidate).toISOString();
}
async function loadVerifiedSource(db: ReturnType<typeof createClient>, table: string, id: string, sessionId: string) {
  if (!SOURCE_TABLES.has(table) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("source_ref_invalid");
  let query: any;
  switch (table) {
    case "mia_messages":
      query = db.from(table).select("id,session_id,sequence_no,role,content,metadata,source_system,source_record_id,created_at").eq("id", id).eq("session_id", sessionId);
      break;
    case "mia_memories":
      query = db.from(table).select("id,identity_id,memory_type,content,importance,occurred_at,source_table,source_record_id,metadata").eq("id", id).eq("identity_id", IDENTITY_ID).neq("memory_type", "idle_draft");
      break;
    case "mia_emotion_events":
      query = db.from(table).select("id,identity_id,emotion_type,intensity,valence,trigger_summary,details,source_table,source_record_id,occurred_at").eq("id", id).eq("identity_id", IDENTITY_ID);
      break;
    case "mia_life_events":
      query = db.from(table).select("id,identity_id,event_type,summary,details,source_table,source_record_id,occurred_at").eq("id", id).eq("identity_id", IDENTITY_ID);
      break;
    case "mia_relationship_context":
      query = db.from(table).select("id,identity_id,related_agent_id,related_person_name,relationship_type,context,confidence,source_table,source_record_id,observed_at").eq("id", id).eq("identity_id", IDENTITY_ID);
      break;
    default:
      throw new Error("source_table_not_allowed");
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("source_not_found_or_out_of_scope");
  if (table === "mia_messages" && data.session_id !== sessionId) throw new Error("message_session_mismatch");
  if (data.identity_id && data.identity_id !== IDENTITY_ID) throw new Error("source_identity_mismatch");
  if (hasAuroraMarker(data)) throw new Error("historical_or_federated_source_excluded");
  const timestamp = sourceTimestamp(table, data);
  const digest = await sha256(canonical(data));
  return {
    reference: {
      source_table: table,
      source_record_id: id,
      source_timestamp: timestamp,
      digest_algorithm: "sha256-canonical-v1",
      source_digest: digest,
    },
    raw: data,
  };
}
function overlapsRawSource(text: string, sources: Record<string, unknown>[]): boolean {
  const normalized = text.toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  if (normalized.length < 80) return false;
  return sources.some((source) => {
    const content = String(source.content ?? source.summary ?? "");
    const sourceText = content.toLocaleLowerCase().replace(/\s+/gu, " ").trim();
    return sourceText.length >= 80 && sourceText.includes(normalized);
  });
}
async function getPrivateSession(db: ReturnType<typeof createClient>): Promise<string> {
  const { data, error } = await db.from("mia_chat_sessions").select("id")
    .eq("identity_id", IDENTITY_ID).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error || !data?.id) throw new Error("mia_private_session_unavailable");
  return data.id;
}
async function listAcceptedCards(db: ReturnType<typeof createClient>) {
  const { data: cards, error } = await db.from("mia_forest_corner_cards")
    .select("card_id,category,title,summary,emotional_tone,evidence_kind,confidence,created_at,supersedes_card_id")
    .eq("identity_id", IDENTITY_ID).eq("privacy_scope", "prototype_mia_private_pair")
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("vault_not_installed_or_unavailable");
  const ids = (cards ?? []).map((card: any) => card.card_id);
  if (!ids.length) return [];
  const { data: events, error: eventError } = await db.from("mia_forest_corner_card_events")
    .select("card_id,event_type,created_at").in("card_id", ids).order("created_at", { ascending: true });
  if (eventError) throw new Error("vault_events_unavailable");
  const state = new Map<string, string>();
  for (const event of events ?? []) state.set(event.card_id, event.event_type);
  const superseded = new Set((cards ?? []).filter((card: any) => card.supersedes_card_id)
    .map((card: any) => card.supersedes_card_id));
  return (cards ?? []).filter((card: any) => state.get(card.card_id) === "accepted" && !superseded.has(card.card_id))
    .map((card: any) => ({ ...card, review_state: "accepted" }));
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || !await validMiaToken(authorization.slice(7))) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "server_not_configured" }, 503);
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: "request_too_large" }, 413);
  const rawBody = await request.text();
  if (encoder.encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: "request_too_large" }, 413);
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_request" }, 400);
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const action = body.action;
    if (action === "list") {
      const cards = await listAcceptedCards(db);
      return json({ ok: true, cards });
    }
    if (action === "propose") {
      const category = safeText(body.category, 40);
      const title = safeText(body.title, 120);
      const summary = safeText(body.summary, 1200);
      const emotionalTone = safeText(body.emotional_tone, 80) || null;
      const evidenceKind = body.evidence_kind;
      const confidence = Number(body.confidence);
      if (!ALLOWED_CATEGORIES.has(category) || !title || !summary
        || !["explicit", "derived"].includes(evidenceKind)
        || !Number.isFinite(confidence) || confidence < 0 || confidence > 1
        || !Array.isArray(body.source_refs) || body.source_refs.length < 1 || body.source_refs.length > MAX_SOURCE_REFS) {
        return json({ error: "invalid_card_proposal" }, 400);
      }
      const sessionId = await getPrivateSession(db);
      const uniqueRefs = new Set<string>();
      const verified = [];
      for (const item of body.source_refs) {
        const table = safeText(item?.source_table, 64);
        const id = safeText(item?.source_record_id, 64);
        const key = table + ":" + id;
        if (uniqueRefs.has(key)) return json({ error: "duplicate_source_ref" }, 400);
        uniqueRefs.add(key);
        verified.push(await loadVerifiedSource(db, table, id, sessionId));
      }
      const sourceRows = verified.map((item) => item.raw);
      if (overlapsRawSource(title + " " + summary, sourceRows)) {
        return json({ error: "card_text_appears_to_quote_source; write a concise abstract instead" }, 400);
      }
      const refs = verified.map((item) => item.reference).sort((a, b) =>
        (a.source_table + ":" + a.source_record_id).localeCompare(b.source_table + ":" + b.source_record_id)
      );
      const manifestDigest = await sha256(canonical(refs));
      const idem = await sha256(canonical({
        identity_id: IDENTITY_ID, category, title, summary, emotional_tone: emotionalTone,
        evidence_kind: evidenceKind, confidence, source_manifest_digest: manifestDigest,
      }));
      const card = {
        identity_id: IDENTITY_ID, schema_version: "1.0.0", category, title, summary,
        emotional_tone: emotionalTone, source_refs: refs,
        source_manifest_digest: manifestDigest, digest_version: "sha256-canonical-v1",
        evidence_kind: evidenceKind, confidence, privacy_scope: "prototype_mia_private_pair",
        idempotency_key: idem,
      };
      if (encoder.encode(JSON.stringify(card)).byteLength > MAX_CARD_BYTES) return json({ error: "card_payload_too_large" }, 413);
      const { data: cardId, error } = await db.rpc("mia_forest_corner_insert_card_v13", {
        p_card: card, p_event_key: "proposal:" + idem,
      });
      if (error || !cardId) {
        console.warn("Forest Corner card proposal failed", error?.code ?? "rpc_error");
        return json({ error: "proposal_not_saved" }, 409);
      }
      return json({ ok: true, proposed: true, card_id: cardId, review_required: true }, 201);
    }
    if (action === "review") {
      const cardId = safeText(body.card_id, 36);
      const decision = body.decision;
      const note = safeText(body.review_note, 500) || null;
      if (!/^[0-9a-f-]{36}$/i.test(cardId) || !["accepted", "rejected"].includes(decision)) {
        return json({ error: "invalid_review" }, 400);
      }
      const { data: card, error: cardError } = await db.from("mia_forest_corner_cards")
        .select("card_id,identity_id,privacy_scope").eq("card_id", cardId).maybeSingle();
      if (cardError || !card || card.identity_id !== IDENTITY_ID || card.privacy_scope !== "prototype_mia_private_pair") {
        return json({ error: "card_not_found" }, 404);
      }
      const eventKey = "review:" + cardId + ":" + decision;
      const { data: existing } = await db.from("mia_forest_corner_card_events")
        .select("event_id,event_type").eq("idempotency_key", eventKey).maybeSingle();
      if (existing) return json({ ok: true, review_state: existing.event_type, idempotent: true });
      const { data: prior, error: priorError } = await db.from("mia_forest_corner_card_events")
        .select("event_type").eq("card_id", cardId);
      if (priorError) return json({ error: "review_state_unavailable" }, 500);
      if (!(prior ?? []).some((event: any) => event.event_type === "proposed")
        || (prior ?? []).some((event: any) => ["accepted", "rejected", "superseded"].includes(event.event_type))) {
        return json({ error: "card_not_reviewable" }, 409);
      }
      const { error } = await db.from("mia_forest_corner_card_events").insert({
        card_id: cardId, event_type: decision, actor_scope: "private_pair_user",
        review_note: note, idempotency_key: eventKey,
      });
      if (error) {
        console.warn("Forest Corner card review rejected", error.code ?? "database_error");
        return json({ error: "review_not_saved" }, 409);
      }
      return json({ ok: true, review_state: decision });
    }
    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "internal_error";
    console.warn("Forest Corner card vault request failed", code.slice(0, 100));
    if (code === "vault_not_installed_or_unavailable") return json({ error: "vault_not_installed" }, 503);
    if (code === "mia_private_session_unavailable") return json({ error: "private_session_unavailable" }, 503);
    if (code === "source_not_found_or_out_of_scope" || code === "message_session_mismatch") return json({ error: "source_not_found_or_out_of_scope" }, 404);
    if (code === "historical_or_federated_source_excluded") return json({ error: "historical_source_excluded" }, 400);
    return json({ error: "request_rejected" }, 400);
  }
});
