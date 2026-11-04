/**
 * Static guard for the Forest Corner SQL proposal.
 * This is NOT a PostgreSQL parser, migration test, or database execution.
 * It checks safety markers and reports known blockers; it never connects to a database.
 * Run: node docs/mia/forest-corner-sql-static-audit.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "docs/mia/forest-corner-private-card-vault-migration-proposal-v1.2.sql";
const sql = readFileSync(path, "utf8");
const lower = sql.toLowerCase();

assert.match(sql, /PROPOSAL ONLY/i, "proposal-only marker must remain");
assert(!/supabase\/migrations\//i.test(path), "proposal must not be stored as a migration");
assert.match(lower, /alter table public\.mia_forest_corner_cards enable row level security/);
assert.match(lower, /alter table public\.mia_forest_corner_card_events enable row level security/);
assert.match(lower, /revoke all on table public\.mia_forest_corner_cards from public, anon, authenticated/);
assert.match(lower, /revoke all on table public\.mia_forest_corner_card_events from public, anon, authenticated/);
assert.match(lower, /grant select, insert on table public\.mia_forest_corner_cards to service_role/);
assert.match(lower, /grant select, insert on table public\.mia_forest_corner_card_events to service_role/);
assert.match(lower, /before update or delete on public\.mia_forest_corner_cards/);
assert.match(lower, /before update or delete on public\.mia_forest_corner_card_events/);
assert.match(lower, /before truncate on public\.mia_forest_corner_cards/);
assert.match(lower, /before truncate on public\.mia_forest_corner_card_events/);

const blockers = [
  ["replaceable shared trigger function", /create or replace function public\.mia_forest_corner_reject_mutation/i.test(sql)],
  ["drop-if-exists trigger replacement", /drop trigger if exists/i.test(sql)],
  ["IF NOT EXISTS does not validate an existing table schema", /create table if not exists/i.test(sql)],
  ["source_refs has no database-enforced element schema", !/jsonb_path|jsonb_to_recordset|source_refs.*check/i.test(sql)],
  ["source digest column is absent", !/source_digest|source_sha256|evidence_digest/i.test(sql)],
  ["event transition uniqueness/ordering is not constrained", !/unique.*card_id.*event_type|unique.*event_type.*card_id/i.test(sql)],
  ["no transaction implementation/RPC is defined for card + initial event", !/create function .*propose.*card|create function .*append.*card/i.test(sql)]
];

console.log("Forest Corner SQL proposal static guard: PASS");
console.log("- safety markers, RLS, browser-role revokes, service-role grants, and append-only trigger declarations: PASS");
console.log("- this is static text inspection only; SQL was NOT parsed or executed");
console.log("- review status: BLOCKED — proposal is not approved for staging or production execution");
for (const [label, present] of blockers) {
  if (present) console.log(`- BLOCKER: ${label}`);
}
