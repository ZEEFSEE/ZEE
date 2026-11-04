import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync("supabase/functions/mia-forest-card-vault/index.ts", "utf8");
const sql = readFileSync("docs/mia/forest-corner-private-card-vault-migration-proposal-v1.3.sql", "utf8").toLowerCase();
const checks = [
  ["prototype Mia identity is fixed", /const IDENTITY_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea"/],
  ["server-only service key", /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/],
  ["HMAC token verification", /crypto\.subtle\.verify\("HMAC"/],
  ["Mia audience and subject pinned", /claims\?\.aud === "mia-chat"[\s\S]*claims\?\.sub === "mia-admin"/],
  ["token expiry and issuance time bounded", /claims\.exp > now[\s\S]*claims\.iat <= now \+ 60[\s\S]*claims\.iat >= now - 4 \* 60 \* 60 - 60/],
  ["source table allowlist", /const SOURCE_TABLES = new Set\([\s\S]*"mia_messages"[\s\S]*"mia_relationship_context"/],
  ["message source scoped to the private session", /\.eq\("session_id", sessionId\)/],
  ["identity-owned source rows pinned", /\.eq\("identity_id", IDENTITY_ID\)/],
  ["idle drafts excluded", /\.neq\("memory_type", "idle_draft"\)/],
  ["historical AURORA and federation source exclusion", /aurora\|federat\|public\[-_ \]chat\|world\[-_ \]runtime/],
  ["canonical SHA-256 evidence digest", /crypto\.subtle\.digest\("SHA-256"/],
  ["only pointer metadata is passed into card RPC", /source_refs: refs,[\s\S]*source_manifest_digest: manifestDigest/],
  ["narrow atomic card insert RPC", /db\.rpc\("mia_forest_corner_insert_card_v13"/],
  ["accepted cards only are listed", /state\.get\(card\.card_id\) === "accepted"/],
  ["explicit accept/reject review only", /\["accepted", "rejected"\]/],
  ["append-only review event insert", /from\("mia_forest_corner_card_events"\)\.insert/],
  ["no automatic scheduler or background capture", !/EdgeRuntime|setInterval|setTimeout|cron|schedule/i.test(source)],
  ["no AURORA endpoint or public relay", !/aurora.*(fetch|invoke)|federation|public_chat/i.test(source)],
  ["request body bounded", /MAX_BODY_BYTES = 16 \* 1024/],
  ["no private source content logging", !/console\.(log|error)\([^\n]*(content|summary|sourceRows)/i.test(source)],
  ["database RPC serializes and caps proposals at two per UTC day", /pg_advisory_xact_lock\(20261104, 1\)/.test(sql) && /if cards_today > 2 then/.test(sql)],
];

for (const [name, pattern] of checks) {
  assert.ok(typeof pattern === "boolean" ? pattern : pattern.test(source), name);
  console.log("PASS", name);
}
console.log(`Forest Corner Edge Function static audit passed: ${checks.length} checks.`);
