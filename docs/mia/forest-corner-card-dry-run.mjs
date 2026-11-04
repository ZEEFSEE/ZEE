/**
 * Prototype Mia Forest Corner memory-card dry run.
 * Synthetic fixtures only. No network, Supabase, filesystem, or chat access.
 * Run: node docs/mia/forest-corner-card-dry-run.mjs
 */
import assert from "node:assert/strict";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const ALLOWED_CATEGORIES = new Set([
  "comfort_anchor", "shared_decision", "emotion_residue", "life_event",
  "reflection", "creative_seed", "relationship_context", "scene_build_progress"
]);
const ALLOWED_TABLES = new Set([
  "mia_messages", "mia_memories", "mia_emotion_events",
  "mia_life_events", "mia_relationship_context"
]);
const FORBIDDEN_KEYS = new Set([
  "raw_text", "message_body", "transcript", "conversation", "private_content",
  "api_key", "token", "password", "email", "phone"
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function stableKey(sourceRefs, category) {
  const canonical = [...sourceRefs]
    .map(x => `${x.source_table}:${x.source_record_id}`)
    .sort().join("|");
  return sha256(`prototype_mia|${category}|${canonical}`);
}
function rejectForbiddenKeys(value, path = "card") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(!FORBIDDEN_KEYS.has(key.toLowerCase()), `forbidden private field: ${path}.${key}`);
    rejectForbiddenKeys(child, `${path}.${key}`);
  }
}
function validateCard(card) {
  rejectForbiddenKeys(card);
  assert.equal(card.schema_version, "1.0.0");
  assert.equal(card.identity_scope, "prototype_mia");
  assert.equal(card.privacy_scope, "prototype_mia_private_pair");
  assert(ALLOWED_CATEGORIES.has(card.category), "unsupported category");
  assert(["explicit", "derived"].includes(card.evidence_kind), "unsupported evidence_kind");
  assert(["proposed", "accepted", "superseded", "rejected"].includes(card.record_state));
  assert(typeof card.title === "string" && card.title.trim().length > 0 && card.title.length <= 120);
  assert(typeof card.summary === "string" && card.summary.trim().length > 0 && card.summary.length <= 1200);
  assert(Number.isFinite(card.confidence) && card.confidence >= 0 && card.confidence <= 1);
  assert(Array.isArray(card.source_refs) && card.source_refs.length > 0);
  for (const ref of card.source_refs) {
    assert(ALLOWED_TABLES.has(ref.source_table), "source table is outside Mia private-source allowlist");
    assert(/^synthetic-[a-z0-9-]+$/i.test(ref.source_record_id), "dry-run accepts synthetic source IDs only");
  }
  assert(/^dryrun-[a-f0-9]{24}$/.test(card.card_id), "card ID must be dry-run scoped");
  assert(/^dryrun-[a-f0-9]{64}$/.test(card.idempotency_key), "idempotency key must be dry-run scoped");
  assert(!/aurora|federation|public[_ -]?broadcast/i.test(JSON.stringify(card)), "historical/external world context excluded");
  return true;
}
function proposeCard(input, createdAt = "2026-11-04T00:00:00.000Z") {
  const key = stableKey(input.source_refs, input.category);
  const card = {
    card_id: `dryrun-${sha256(key).slice(0,24)}`,
    schema_version: "1.0.0",
    identity_scope: "prototype_mia",
    category: input.category,
    title: input.title,
    summary: input.summary,
    ...(input.emotional_tone ? { emotional_tone: input.emotional_tone } : {}),
    source_refs: input.source_refs.map(x => ({ ...x })),
    evidence_kind: input.evidence_kind ?? "explicit",
    confidence: input.confidence ?? 1,
    privacy_scope: "prototype_mia_private_pair",
    created_at: createdAt,
    idempotency_key: `dryrun-${key}`,
    record_state: "proposed",
    supersedes_card_id: input.supersedes_card_id ?? null,
    review_note: input.review_note ?? null
  };
  validateCard(card);
  return card;
}
// Append-only ledger: revisions add a new card; prior entries are never mutated.
function appendOnce(ledger, card) {
  validateCard(card);
  const existing = ledger.find(x => x.idempotency_key === card.idempotency_key);
  if (existing) return { inserted: false, card: existing };
  ledger.push(structuredClone(card));
  return { inserted: true, card };
}
function currentCards(ledger) {
  const superseded = new Set(ledger.map(x => x.supersedes_card_id).filter(Boolean));
  return ledger.filter(x => !superseded.has(x.card_id));
}

// Synthetic HMAC token contract tests. The key below is fake test material only.
function encodePart(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function signSyntheticToken(payload, secret) {
  const encoded = encodePart(payload);
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}
function verifySyntheticToken(token, secret, nowSeconds) {
  if (!secret || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], "base64url"); } catch { return false; }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { return false; }
  return payload.aud === "mia-chat" &&
    payload.sub === "mia-admin" &&
    Number.isInteger(payload.iat) &&
    Number.isInteger(payload.exp) &&
    payload.iat <= nowSeconds &&
    payload.exp > nowSeconds &&
    payload.exp - payload.iat <= 4 * 60 * 60;
}
const syntheticSecret = "synthetic-only-not-a-real-service-role-secret";
const syntheticNow = 1_800_000_000;
const validPayload = { aud: "mia-chat", sub: "mia-admin", iat: syntheticNow - 60, exp: syntheticNow + 3600, jti: "synthetic-jti" };
const validToken = signSyntheticToken(validPayload, syntheticSecret);
assert.equal(verifySyntheticToken(validToken, syntheticSecret, syntheticNow), true, "valid synthetic auth token");
assert.equal(verifySyntheticToken(validToken, "", syntheticNow), false, "missing secret fails closed");
assert.equal(verifySyntheticToken(signSyntheticToken({ ...validPayload, aud: "other" }, syntheticSecret), syntheticSecret, syntheticNow), false, "wrong audience rejected");
assert.equal(verifySyntheticToken(signSyntheticToken({ ...validPayload, sub: "mia-02" }, syntheticSecret), syntheticSecret, syntheticNow), false, "wrong subject rejected");
assert.equal(verifySyntheticToken(signSyntheticToken({ ...validPayload, exp: syntheticNow - 1 }, syntheticSecret), syntheticSecret, syntheticNow), false, "expired token rejected");
assert.equal(verifySyntheticToken(signSyntheticToken({ ...validPayload, iat: syntheticNow + 1 }, syntheticSecret), syntheticSecret, syntheticNow), false, "future issued token rejected");
assert.equal(verifySyntheticToken(signSyntheticToken({ ...validPayload, exp: syntheticNow + 5 * 3600 }, syntheticSecret), syntheticSecret, syntheticNow), false, "excessive token lifetime rejected");
assert.equal(verifySyntheticToken(validToken.slice(0, -1) + (validToken.endsWith("A") ? "B" : "A"), syntheticSecret, syntheticNow), false, "tampered signature rejected");

const fixture = {
  category: "comfort_anchor",
  title: "Quiet corner remains available",
  summary: "Synthetic test: the lounge can remain idle or listen without prompting activity.",
  evidence_kind: "explicit",
  confidence: 1,
  source_refs: [{ source_table: "mia_memories", source_record_id: "synthetic-memory-001" }]
};

const ledger = [];
const first = proposeCard(fixture);
assert.equal(appendOnce(ledger, first).inserted, true, "first insert");
assert.equal(appendOnce(ledger, first).inserted, false, "duplicate is idempotent");
assert.equal(ledger.length, 1, "duplicate did not append");

const revision = proposeCard({
  ...fixture,
  title: "Quiet corner is a comfort anchor",
  summary: "Synthetic revision: wording refined without rewriting the original card.",
  supersedes_card_id: first.card_id,
  source_refs: [{ source_table: "mia_memories", source_record_id: "synthetic-memory-002" }]
});
const originalSnapshot = JSON.stringify(ledger[0]);
appendOnce(ledger, revision);
assert.equal(JSON.stringify(ledger[0]), originalSnapshot, "revision never mutates history");
assert.deepEqual(currentCards(ledger).map(x => x.card_id), [revision.card_id], "projection resolves latest revision");

assert.throws(() => proposeCard({ ...fixture, source_refs: [{ source_table: "mia_messages", source_record_id: "real-user-message-id" }] }), /synthetic source IDs only/);
assert.throws(() => proposeCard({ ...fixture, source_refs: [{ source_table: "aurora_public_messages", source_record_id: "synthetic-aurora-1" }] }), /source table is outside/);
assert.throws(() => validateCard({ ...first, raw_text: "must never be stored" }), /forbidden private field/);
assert.throws(() => validateCard({ ...first, identity_scope: "mia-02" }), /prototype_mia/);

console.log("Forest Corner card dry-run: PASS");
console.log("- synthetic fixture only; no private chat or memory was read");
console.log("- schema boundary and identity/privacy scope checks: PASS");
console.log("- source allowlist and external/AURORA exclusion: PASS");
console.log("- idempotent duplicate suppression: PASS");
console.log("- append-only revision and current-card projection: PASS");
console.log("- synthetic HMAC token signature, audience, subject, expiry, iat, and missing-secret checks: PASS");
console.log("- no network, Supabase, filesystem, or production writes");
