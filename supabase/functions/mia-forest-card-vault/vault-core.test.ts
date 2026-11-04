import {
  ALLOWED_CATEGORIES, IDENTITY_ID, SOURCE_TABLES, canonical,
  isHistoricalSource, sha256, sourceTimestamp, validMiaToken, validProposalFields,
} from "./vault-core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(message + ": expected " + String(expected) + ", got " + String(actual));
}
function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function tokenFor(claims: Record<string, unknown>, keyText: string): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(keyText), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return payload + "." + b64url(signature);
}

Deno.test("prototype identity and source/category allowlists are fixed", () => {
  assertEqual(IDENTITY_ID, "cb6d01b4-0e3f-46ee-8946-360aa91db1ea", "identity pin");
  assert(SOURCE_TABLES.has("mia_messages"), "private messages are allowlisted");
  assert(SOURCE_TABLES.has("mia_memories"), "Mia memories are allowlisted");
  assert(!SOURCE_TABLES.has("mia_messages_public"), "public messages are not allowlisted");
  assert(!SOURCE_TABLES.has("mia_agent_information_context_archive"), "shared archive is not allowlisted");
  assert(ALLOWED_CATEGORIES.has("comfort_anchor"), "known category is allowed");
  assert(!ALLOWED_CATEGORIES.has("public_broadcast"), "public broadcast category is not allowed");
});

Deno.test("Mia HMAC token accepts only the expected audience, subject and time window", async () => {
  const key = "synthetic-service-role-key-never-production";
  const now = 2_000_000_000;
  const base = { aud: "mia-chat", sub: "mia-admin", iat: now - 60, exp: now + 3600 };
  assert(await validMiaToken(await tokenFor(base, key), key, now), "valid Mia token");
  assert(!await validMiaToken(await tokenFor({ ...base, aud: "aurora-public" }, key), key, now), "wrong audience rejected");
  assert(!await validMiaToken(await tokenFor({ ...base, sub: "mia-02" }, key), key, now), "wrong subject rejected");
  assert(!await validMiaToken(await tokenFor({ ...base, exp: now - 1 }, key), key, now), "expired token rejected");
  assert(!await validMiaToken(await tokenFor({ ...base, iat: now + 61 }, key), key, now), "future-issued token rejected");
  assert(!await validMiaToken(await tokenFor({ ...base, iat: now - 5 * 3600, exp: now + 3600 }, key), key, now), "old token rejected");
  assert(!await validMiaToken(await tokenFor({ ...base, exp: now + 5 * 3600 }, key), key, now), "excessive lifetime rejected");
  assert(!await validMiaToken("not.a.valid.token", key, now), "malformed token rejected");
  assert(!await validMiaToken(await tokenFor(base, key), key + "-wrong", now), "wrong signing key rejected");
});

Deno.test("canonical serialization and SHA-256 are deterministic", async () => {
  assertEqual(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }), "object key order normalized");
  assertEqual(canonical([2, 1]), "[2,1]", "array order retained");
  assertEqual(await sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "known SHA-256 vector");
});

Deno.test("historical AURORA and federation markers are excluded", () => {
  assert(isHistoricalSource({ event_type: "aurora_presence_joined" }), "AURORA event rejected");
  assert(isHistoricalSource({ details: { source: "federated_public_chat" } }), "federated event rejected");
  assert(!isHistoricalSource({ event_type: "quiet_reflection", summary: "A quiet afternoon thought" }), "ordinary Mia source retained");
});

Deno.test("source timestamps normalize and malformed values fail closed", () => {
  assertEqual(sourceTimestamp("mia_messages", { created_at: "2026-11-04T01:00:00+08:00" }), "2026-11-03T17:00:00.000Z", "message timestamp normalized");
  assertEqual(sourceTimestamp("mia_relationship_context", { observed_at: "2026-11-04T00:00:00Z" }), "2026-11-04T00:00:00.000Z", "relationship timestamp normalized");
  let rejected = false;
  try { sourceTimestamp("mia_memories", { occurred_at: "not-a-date" }); } catch { rejected = true; }
  assert(rejected, "invalid timestamp rejected");
});

Deno.test("proposal fields are bounded and require a numeric confidence", () => {
  const valid = {
    category: "comfort_anchor", title: "Quiet corner",
    summary: "A short abstract note about a durable moment.",
    evidence_kind: "explicit", confidence: 0.8,
    source_refs: [{ source_table: "mia_memories", source_record_id: "00000000-0000-0000-0000-000000000001" }],
  };
  assert(validProposalFields(valid), "valid proposal accepted");
  assert(!validProposalFields({ ...valid, confidence: "0.8" }), "string confidence rejected");
  assert(!validProposalFields({ ...valid, confidence: null }), "null confidence rejected");
  assert(!validProposalFields({ ...valid, category: "public_broadcast" }), "unknown category rejected");
  assert(!validProposalFields({ ...valid, source_refs: [] }), "empty source refs rejected");
  assert(!validProposalFields({ ...valid, summary: "x".repeat(1201) }), "oversized summary rejected");
});
