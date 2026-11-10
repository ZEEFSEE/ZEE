import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../../supabase/functions/echo-submit/index.ts", import.meta.url), "utf8");
const gate = readFileSync(new URL("../../supabase/functions/_shared/echo-publication-gate.mjs", import.meta.url), "utf8");
const agnesAdapter = readFileSync(new URL("../../supabase/functions/_shared/agnes-mailbox-adapter.mjs", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../supabase/design/echo-mailbox-v2-schema.draft.sql", import.meta.url), "utf8");

assert.match(html, /data-lang="zh"/, "Chinese language toggle must exist");
assert.match(html, /data-lang="en"/, "English language toggle must exist");
assert.match(html, /publish-consent/, "Explicit publication consent must exist");
assert.match(html, /does not send or store|不会发送或保存/, "Preview must clearly disclose that it does not submit");
assert.match(html, /addEventListener\('submit'/, "Form must have an explicit safe submit handler");
assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|sendBeacon/, "Preview must not transmit visitor content");
assert.doesNotMatch(html, /AGNES_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, "No server secrets may appear in frontend");
assert.match(html, /Mia's Echoes|Mia 的回声/, "Public archive section must exist");

assert.match(endpoint, /mailbox_not_live/, "Endpoint must remain explicitly disabled");
assert.match(endpoint, /return json\(503/, "Endpoint must fail closed with HTTP 503");
assert.doesNotMatch(endpoint, /req\.json\(|req\.text\(|fetch\s*\(|\.insert\s*\(|\.upsert\s*\(/, "Disabled endpoint must not parse, forward, or persist submissions");
assert.doesNotMatch(endpoint, /AGNES_API_KEY|SUPABASE_SERVICE_ROLE_KEY/, "No secrets may be hardcoded in endpoint source");

for (const required of [
  "consentGranted", "consentCoversQuestionAndAnswer", "inputSafetyPassed",
  "selectionPassed", "miaChoseToAnswer", "outputSafetyPassed",
  "questionAnswerPairSafetyPassed", "publicationScopeIsPublicOnly",
  "privateMemoryAccessed", "authorizationConsumed", "replayDetected",
  "submission_hash_mismatch", "final_content_hash_mismatch",
]) {
  assert.ok(gate.includes(required), `Publication gate must enforce ${required}`);
}

assert.match(schema, /create schema if not exists echo_private/i, "Dedicated private schema draft must exist");
assert.match(schema, /alter table public\.echo_publications enable row level security/i, "Public archive must use RLS");
assert.match(schema, /before insert on public\.echo_publications/i, "Database publication gate trigger must exist");
assert.match(schema, /echo_authorization_replay/, "Database gate must reject authorization replay");

assert.match(agnesAdapter, /agnes_zero_cost_not_confirmed/, "AGNES calls must be blocked without explicit zero-cost confirmation");
assert.match(agnesAdapter, /apihub\.agnes-ai\.com\/v1\/chat\/completions/, "Only the AGNES API endpoint may be used");
assert.doesNotMatch(agnesAdapter, /groq|GROQ/i, "No Groq fallback may exist");

console.log("Echo Mailbox frontend and fail-closed backend checks passed.");
