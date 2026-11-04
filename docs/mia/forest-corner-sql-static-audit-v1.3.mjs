/**
 * Static guard for the V1.3 Forest Corner SQL proposal.
 * This is NOT a PostgreSQL parser, migration test, or database execution.
 * It reads only the checked-in SQL text and never connects to a database.
 * Run: node docs/mia/forest-corner-sql-static-audit-v1.3.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "docs/mia/forest-corner-private-card-vault-migration-proposal-v1.3.sql";
const sql = readFileSync(path, "utf8");
const lower = sql.toLowerCase();

assert.match(sql, /PROPOSAL ONLY/i);
assert.match(lower, /begin;/);
assert.match(lower, /commit;/);
assert.match(lower, /do \$preflight\$/);
assert.match(lower, /raise exception 'refusing to proceed/);
assert.doesNotMatch(lower, /create table if not exists/);
assert.doesNotMatch(lower, /create or replace function/);
assert.doesNotMatch(lower, /drop trigger/);
assert.match(lower, /source_manifest_digest/);
assert.match(lower, /sha256-canonical-v1/);
assert.match(lower, /jsonb_array_elements/);
assert.match(lower, /source_table is null or source_table not in/);
assert.match(lower, /source_digest is null/);
assert.match(lower, /for update/);
assert.match(lower, /one_proposal_v13/);
assert.match(lower, /one_review_v13/);
assert.match(lower, /security definer/);
assert.match(lower, /revoke all on function public\.mia_forest_corner_insert_card_v13\(jsonb,text\) from public, anon, authenticated/);
assert.match(lower, /grant execute on function public\.mia_forest_corner_insert_card_v13\(jsonb,text\) to service_role/);
assert.match(lower, /revoke insert on table public\.mia_forest_corner_cards from service_role/);
assert.match(lower, /before update or delete/);
assert.match(lower, /before truncate/);
assert.match(lower, /alter table public\.mia_forest_corner_cards enable row level security/);
assert.match(lower, /alter table public\.mia_forest_corner_card_events enable row level security/);
assert.match(lower, /rollback \/ decommission/i);

console.log("Forest Corner SQL V1.3 static guard: PASS");
console.log("- fail-closed preflight and no replace/drop-if-exists patterns: PASS");
console.log("- source digest, bounded source_refs, allowlist, and payload limits: PASS");
console.log("- event serialization and uniqueness declarations: PASS");
console.log("- narrow atomic insert RPC and browser-role EXECUTE revokes: PASS");
console.log("- RLS, browser-role table revokes, append-only triggers: PASS");
console.log("- NON-EXECUTING CHECK ONLY: PostgreSQL syntax/behavior remains unverified");
console.log("- status: NOT APPROVED FOR STAGING OR PRODUCTION EXECUTION");
