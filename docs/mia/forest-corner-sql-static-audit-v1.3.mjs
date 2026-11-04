/**
 * Structural static guard for the V1.3 Forest Corner SQL proposal.
 * This is NOT a PostgreSQL parser, migration test, or database execution.
 * It reads checked-in SQL only; no network, filesystem writes, or DB access.
 * Run: node docs/mia/forest-corner-sql-static-audit-v1.3.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "docs/mia/forest-corner-private-card-vault-migration-proposal-v1.3.sql";
const sql = readFileSync(path, "utf8");
const lower = sql.toLowerCase();

function stripSqlLiteralsAndComments(source) {
  let out = "";
  let i = 0;
  let state = "normal";
  let dollarTag = "";
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (state === "line-comment") {
      if (c === "\n") { state = "normal"; out += "\n"; } else out += " ";
      i++; continue;
    }
    if (state === "block-comment") {
      if (c === "*" && n === "/") { out += "  "; i += 2; state = "normal"; }
      else { out += c === "\n" ? "\n" : " "; i++; }
      continue;
    }
    if (state === "single-quote") {
      if (c === "'" && n === "'") { out += "  "; i += 2; }
      else if (c === "'") { out += " "; i++; state = "normal"; }
      else { out += c === "\n" ? "\n" : " "; i++; }
      continue;
    }
    if (state === "double-quote") {
      if (c === '"' && n === '"') { out += "  "; i += 2; }
      else if (c === '"') { out += " "; i++; state = "normal"; }
      else { out += c === "\n" ? "\n" : " "; i++; }
      continue;
    }
    if (state === "dollar-quote") {
      if (source.startsWith(dollarTag, i)) {
        out += " ".repeat(dollarTag.length); i += dollarTag.length; state = "normal"; dollarTag = "";
      } else { out += c === "\n" ? "\n" : " "; i++; }
      continue;
    }
    if (c === "-" && n === "-") { out += "  "; i += 2; state = "line-comment"; continue; }
    if (c === "/" && n === "*") { out += "  "; i += 2; state = "block-comment"; continue; }
    if (c === "'") { out += " "; i++; state = "single-quote"; continue; }
    if (c === '"') { out += " "; i++; state = "double-quote"; continue; }
    if (c === "$") {
      const match = source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) { dollarTag = match[0]; out += " ".repeat(dollarTag.length); i += dollarTag.length; state = "dollar-quote"; continue; }
    }
    out += c; i++;
  }
  assert.equal(state, "normal", `Unterminated SQL lexical construct: ${state}`);
  return out;
}

const executable = stripSqlLiteralsAndComments(sql);
assert.match(sql, /PROPOSAL ONLY/i);
assert.equal((executable.match(/\bbegin\s*;/gi) || []).length, 1, "exactly one transaction BEGIN is required");
assert.equal((executable.match(/\bcommit\s*;/gi) || []).length, 1, "exactly one transaction COMMIT is required");
assert.equal((executable.match(/\bcreate\s+function\s+public\.mia_forest_corner_validate_card_v13\b/gi) || []).length, 1);
assert.equal((executable.match(/\bcreate\s+function\s+public\.mia_forest_corner_reject_mutation_v13\b/gi) || []).length, 1);
assert.equal((executable.match(/\bcreate\s+function\s+public\.mia_forest_corner_guard_event_v13\b/gi) || []).length, 1);
assert.equal((executable.match(/\bcreate\s+function\s+public\.mia_forest_corner_insert_card_v13\b/gi) || []).length, 1);

let depth = 0;
for (const ch of executable) {
  if (ch === "(") depth++;
  if (ch === ")") depth--;
  assert.ok(depth >= 0, "SQL closing parenthesis has no matching opener");
}
assert.equal(depth, 0, "SQL parentheses must be balanced");

const fnTags = (sql.match(/\$fn\$/g) || []).length;
const preflightTags = (sql.match(/\$preflight\$/g) || []).length;
assert.equal(fnTags, 8, "four PL/pgSQL function bodies require eight $fn$ delimiters");
assert.equal(preflightTags, 2, "preflight block requires two $preflight$ delimiters");
assert.match(sql, /or source_digest !~ '\^\[0-9a-f\]\{64\}\$' then/i,
  "source digest predicate must be complete and followed by THEN");
assert.doesNotMatch(sql, /source_digest !~ '\^\[0-9a-f\]\{64\}\s*\n\s*raise exception/i,
  "malformed digest predicate regression");
assert.equal((sql.match(/create function public\.mia_forest_corner_validate_card_v13/gi) || []).length, 1);
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

console.log("Forest Corner SQL V1.3 structural static guard: PASS");
console.log("- lexical closure, balanced parentheses, one transaction boundary: PASS");
console.log("- function definitions and dollar-quote delimiters: PASS");
console.log("- complete SHA-256 predicate and malformed-predicate regression: PASS");
console.log("- fail-closed preflight, source allowlist, bounded references: PASS");
console.log("- narrow RPC grants, RLS, append-only triggers: PASS");
console.log("- NON-EXECUTING CHECK ONLY: PostgreSQL syntax/behavior remains unverified");
console.log("- status: NOT APPROVED FOR STAGING OR PRODUCTION EXECUTION");
