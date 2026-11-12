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
assert.match(html, /submitting will send your thought|提交时会尝试将想法发送/, "The form must disclose that it submits through the dedicated endpoint");
assert.match(html, /addEventListener\('submit'/, "Form must have an explicit safe submit handler");
assert.match(html, /functions.*echo-submit/, "Submissions must use the dedicated Echo endpoint");
assert.match(html, /echo_publications/, "Archive must read only the public Echo archive");
assert.match(html, /textContent/, "Untrusted archive content must be rendered as text");
assert.doesNotMatch(html, /mia_messages|mia_memories|mia_identity|mia_personality_state/i, "Frontend must not access Mia private data");
assert.doesNotMatch(html, /AGNES_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, "No server secrets may appear in frontend");
assert.match(html, /Mia's Echoes|Mia 的回声/, "Public archive section must exist");

assert.match(endpoint, /function deploymentActivationApproved\(\): boolean \{ return true; \}/, "Activation approval must be explicit in source");
assert.match(endpoint, /ECHO_AGNES_ZERO_COST_CONFIRMED/, "AGNES calls require explicit zero-cost confirmation");
assert.match(endpoint, /ECHO_MAILBOX_ENABLED/, "Mailbox retains an explicit emergency stop");
assert.match(endpoint, /agnes-3.0-flash/, "Echo reuses the existing AGNES model default");
assert.match(endpoint, /ECHO_RATE_LIMIT_SECRET.*serviceRoleKey/s, "Rate limiting reuses the server key if no dedicated secret exists");
assert.match(endpoint, /mailbox_not_live/, "Endpoint must remain disabled by default");
assert.match(endpoint, /runEchoPipeline/, "Endpoint must use the tested automated pipeline");
assert.match(endpoint, /createEchoPersistence/, "Endpoint must use the narrow mailbox RPC adapter");
assert.match(endpoint, /hmacHex/, "Rate-limit identity must be HMAC hashed server-side");
assert.match(endpoint, /origin_not_allowed/, "Endpoint must enforce the exact allowed origin");
assert.match(endpoint, /echo_pipeline_completed/, "Every completed pipeline outcome must be logged without content");
assert.match(endpoint, /outcome: result.status/, "Pipeline outcome must be observable in sanitized logs");
assert.match(endpoint, /rate_limit_exceeded/, "Rate limits must not be misreported as accepted submissions");
assert.match(endpoint, /duplicate_or_replayed/, "Idempotency replays must have an explicit outcome");
assert.match(endpoint, /outcome: "no_reply"/, "Mia's explicit silence must be distinguishable from system failure");
assert.match(endpoint, /result.status === "refused"/, "Mia's refusal must have its own terminal response");
assert.match(endpoint, /outcome: "mia_declined"/, "Mia's refusal must not be merged with silence");
assert.match(endpoint, /result.status === "discarded"/, "Moderation rejection must have its own terminal response");
assert.match(endpoint, /safety_review_not_passed/, "Moderation rejection must not be reported as an accepted submission");
assert.match(html, /result.outcome==='mia_declined'/, "Frontend must distinguish Mia's refusal");
assert.match(html, /result.outcome==='safety_review_not_passed'/, "Frontend must distinguish automated safety rejection");
assert.match(html, /Mia has chosen to remain silent this time/, "Frontend must explain an explicit no-reply outcome");
assert.match(html, /没有形成可公开的回声/, "Frontend must distinguish receipt from public publication");

const activationIndex = endpoint.indexOf("if (!deploymentActivationApproved()");
const costIndex = endpoint.indexOf("ECHO_AGNES_ZERO_COST_CONFIRMED");
const bodyReadIndex = endpoint.indexOf("await req.text()");
assert.ok(activationIndex >= 0 && costIndex > activationIndex && bodyReadIndex > costIndex,
  "Activation and zero-cost checks must occur before request-body parsing");
assert.match(endpoint, /console\.warn\("echo_pipeline_failed_closed"/, "Endpoint may log sanitized failure stage diagnostics");
assert.doesNotMatch(endpoint, /console\.warn\([^)]*payload\.text/s, "Endpoint must never log visitor content");
assert.doesNotMatch(endpoint, /client\.from\(/, "Endpoint must not query arbitrary Supabase tables");
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
assert.match(agnesAdapter, /timeoutMs = 27000/, "AGNES calls must use a bounded extended timeout");
assert.match(agnesAdapter, /agnes_auth_rejected/, "AGNES authentication failures must be distinguishable");
assert.match(agnesAdapter, /agnes_rate_limited/, "AGNES throttling failures must be distinguishable");
assert.match(pipeline, /completeWithinBudget/, "Pipeline must enforce a total processing budget");
assert.match(pipeline, /diagnostic: \{ stage, code \}/, "Pipeline failures must return sanitized stage diagnostics");
assert.match(endpoint, /echo_pipeline_failed_closed/, "Server logs must identify failure stage without logging visitor content");
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
