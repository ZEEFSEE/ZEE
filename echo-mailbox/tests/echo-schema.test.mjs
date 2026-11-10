import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../supabase/design/echo-mailbox-v2-schema.draft.sql", import.meta.url), "utf8");

test("draft keeps visitor payloads in a dedicated private schema", () => {
  assert.match(sql, /create schema if not exists echo_private/i);
  assert.match(sql, /revoke all on schema echo_private from public, anon, authenticated/i);
  assert.match(sql, /create table if not exists echo_private\.submission_payloads/i);
  assert.match(sql, /alter table echo_private\.submission_payloads enable row level security/i);
  assert.doesNotMatch(sql, /grant [^;]* on schema echo_private to anon/i);
  assert.doesNotMatch(sql, /grant [^;]* on schema echo_private to authenticated/i);
});

test("public archive grants read-only access to selected public columns", () => {
  assert.match(sql, /grant select \(id, original_question, mia_answer, source_language, answer_language, published_at\)\s+on public\.echo_publications to anon, authenticated/i);
  assert.match(sql, /revoke delete on public\.echo_publications from service_role/i);
  assert.match(sql, /using \(is_published is true and withdrawn_at is null\)/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*public\.echo_publications[^;]*to anon/i);
});

test("database trigger binds publication to consent, original payload and one-time hashes", () => {
  for (const token of [
    "consent_to_publication",
    "consent_version",
    "consent_recorded_at",
    "body_sha256",
    "submission_payloads",
    "status <> 'selected'",
    "extensions.digest",
    "consumed_at",
    "echo_authorization_replay",
    "echo_content_hash_mismatch",
  ]) assert.ok(sql.includes(token), `Missing database gate control: ${token}`);
  assert.match(sql, /before insert on public\.echo_publications/i);
  assert.match(sql, /delete from echo_private\.submission_payloads where submission_id = v_submission\.id/i);
});

test("withdrawal is irreversible and non-selected payloads have an expiry worker", () => {
  assert.match(sql, /echo_withdrawal_irreversible/);
  assert.match(sql, /echo_republication_forbidden/);
  assert.match(sql, /create or replace function echo_private\.expire_echo_payloads/i);
  assert.match(sql, /cron\.schedule\s*\(/i);
  assert.match(sql, /echo-mailbox-expiry/);
});


test("service role has RPC execution only, not direct mailbox table access", () => {
  assert.match(sql, /revoke all on schema echo_private from public, anon, authenticated, service_role/i);
  assert.match(sql, /revoke all on all tables in schema echo_private from public, anon, authenticated, service_role/i);
  assert.match(sql, /revoke all on public\.echo_publications from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /grant [^;]* on echo_private\.[^;]* to service_role/i);
  assert.doesNotMatch(sql, /grant [^;]* on public\.echo_publications to service_role/i);
});

test("database exposes only server-only RPC operations for writes", () => {
  for (const fn of [
    "echo_register_submission", "echo_issue_authorization", "echo_publish",
    "echo_discard_submission", "echo_revoke_authorization",
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`, "i"));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}.*to service_role`, "i"));
  }
  assert.match(sql, /p_body_sha256/);
  assert.match(sql, /v_count > 5/);
  assert.match(sql, /p_evidence->>'consentCoversQuestionAndAnswer'/);
  assert.match(sql, /p_evidence->>'privateMemoryAccessed'/);
  assert.match(sql, /echo_original_submission_mismatch/);
});
