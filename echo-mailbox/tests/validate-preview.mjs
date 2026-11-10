import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../../supabase/functions/echo-submit/index.ts", import.meta.url), "utf8");
const gate = readFileSync(new URL("../../supabase/functions/_shared/echo-publication-gate.mjs", import.meta.url), "utf8");
const agnesAdapter = readFileSync(new URL("../../supabase/functions/_shared/agnes-mailbox-adapter.mjs", import.meta.url), "utf8");
const pipeline = readFileSync(new URL("../../supabase/functions/_shared/echo-pipeline.mjs", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../../supabase/functions/_shared/echo-persistence.mjs", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../supabase/design/echo-mailbox-v2-schema.draft.sql", import.meta.url), "utf8");

assert.match(html, /data-lang="zh"/, "Chinese language toggle must exist");
assert.match(html, /data-lang="en"/, "English language toggle must exist");
assert.match(html, /publish-consent/, "Explicit publication consent must exist");
assert.match(html, /does not send or store|不会发送或保存/, "Preview must clearly disclose that it does not submit");
assert.match(html, /addEventListener\('submit'/, "Form must have an explicit safe submit handler");
assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|sendBeacon/, "Preview must not transmit visitor content");
assert.doesNotMatch(html, /AGNES_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, "No server secrets may appear in frontend");
assert.match(html, /Mia's Echoes|Mia 的回声/, "Public archive section must exist");

assert.match(endpoint, /DEPLOYMENT_ACTIVATION_APPROVED = false/, "Public intake must have a source-level activation lock");
assert.match(endpoint, /ECHO_AGNES_ZERO_COST_CONFIRMED/, "AGNES calls require explicit zero-cost confirmation");
assert.match(endpoint, /mailbox_not_live/, "Endpoint must remain disabled by default");
assert.match(endpoint, /runEchoPipeline/, "Endpoint must use the tested automated pipeline");
assert.match(endpoint, /createEchoPersistence/, "Endpoint must use the narrow mailbox RPC adapter");
assert.match(endpoint, /hmacHex/, "Rate-limit identity must be HMAC hashed server-side");
assert.match(endpoint, /origin_not_allowed/, "Endpoint must enforce the exact allowed origin");
const activationIndex = endpoint.indexOf("DEPLOYMENT_ACTIVATION_APPROVED");
const costIndex = endpoint.indexOf("ECHO_AGNES_ZERO_COST_CONFIRMED");
const bodyReadIndex = endpoint.indexOf("await req.text()");
assert.ok(activationIndex >= 0 && costIndex > activationIndex && bodyReadIndex > costIndex,
  "Activation and zero-cost checks must occur before request-body parsing");
assert.doesNotMatch(endpoint, /console\.(log|error|warn)/, "Endpoint must not log visitor content");
assert.doesNotMatch(endpoint, /\.from\(/, "Endpoint must not query arbitrary Supabase tables");
assert.doesNotMatch(endpoint, /mia_messages|mia_memories|mia_identity|mia_personality_state/i,
  "Endpoint must not access Mia private data");

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
assert.match(pipeline, /INPUT_REVIEW_PROMPT/, "Pipeline must run automated input review");
assert.match(pipeline, /SELECTION_PROMPT/, "Mia must explicitly choose whether to answer");
assert.match(pipeline, /OUTPUT_REVIEW_PROMPT/, "Pipeline must review generated output");
assert.match(pipeline, /PAIR_REVIEW_PROMPT/, "Pipeline must review the question and answer together");
assert.match(pipeline, /publishAtomically/, "Publication must use an atomic database operation");
assert.match(pipeline, /safeRevoke/, "Unused publication authorizations must be revoked");
assert.doesNotMatch(pipeline, /mia_messages|mia_memories|mia_identity|mia_personality_state/i, "Pipeline must not query private Mia tables");
assert.match(persistence, /client\.rpc\(/, "Persistence must use server-only RPC calls");
assert.doesNotMatch(persistence, /client\.from\(/, "Persistence must not query arbitrary database tables");
assert.doesNotMatch(persistence, /mia_messages|mia_memories|mia_identity|mia_personality_state/i, "Persistence must not access private Mia tables");

console.log("Echo Mailbox frontend and fail-closed backend checks passed.");
