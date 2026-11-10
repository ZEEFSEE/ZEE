# Echo Mailbox backend status

## Current implementation boundary

The public website is live, but public submissions remain **disabled**.

- `supabase/functions/echo-submit/index.ts` is wired to the automated pipeline but has a source-level `DEPLOYMENT_ACTIVATION_APPROVED = false` lock. It returns `503 mailbox_not_live` before reading the request body; environment flags alone cannot activate it.
- `supabase/functions/_shared/echo-publication-gate.mjs` is a pure deterministic gate helper. It has no network, Supabase, or AGNES dependencies.
- `supabase/functions/_shared/echo-persistence.mjs` exposes only dedicated server-side RPC operations; it never queries arbitrary tables. The live database exposes only SECURITY INVOKER public wrappers to `service_role`; their SECURITY DEFINER implementations live in the unexposed `echo_private` schema and verify the JWT role. The service role has no direct table access to the mailbox schema.
- `supabase/functions/_shared/echo-pipeline.mjs` contains the dependency-injected automated sequence: input review, Mia's answer/silence choice, reply generation, output review, combined-pair review, hash-bound authorization, and atomic publish call. It is not yet wired to the live database.
- `supabase/functions/_shared/agnes-mailbox-adapter.mjs` is a server-only AGNES adapter. It refuses all network calls unless `zeroCostConfirmed === true`, uses the fixed AGNES endpoint, and has no Groq fallback. It is not yet wired into a live submission flow.
- `echo-mailbox/tests/echo-gate.test.mjs` exercises missing checks, explicit consent, language matching, tampering, duplicate/replay states, private-memory isolation, and uncertainty.
- The helper is **not yet wired into a live publication worker or database transaction**. The unit tests do not prove production publication safety by themselves.
- The SQL files under `supabase/design/` are design-only and have not been applied. The V2 draft is `echo-mailbox-v2-schema.draft.sql`.

## Required publication conditions

The helper denies publication unless all conditions are explicitly true:

1. Visitor consent is recorded and specifically covers publication of the original question together with Mia's answer.
2. Input privacy/safety and abuse checks pass.
3. Mia's selection stage explicitly chooses to answer.
4. Output review and combined question/answer review pass.
5. The answer preserves the submission language (Chinese or English).
6. Rate-limit and idempotency checks pass.
7. Publication scope is limited to the public mailbox.
8. All source, reviewed, and final content hashes match.
9. The authorization is present, unconsumed, and not revoked.
10. No uncertainty, replay, duplicate publication, or private-memory access is present.

Missing, false, unknown, mismatched, or incomplete evidence denies publication. A successful pure-helper result is not a transaction: the eventual worker must atomically consume a one-time authorization and insert the publication in the database.

## AGNES and cost boundary

- AGNES is the only intended model provider; there is no Groq fallback.
- No AGNES API request is made by the current preview or gate helper.
- Do not enable model calls until the existing AGNES API allowance is confirmed to be zero-cost for this use.
- The Supabase organization is on the Free plan. Free-plan quotas are shared across the organization; current consumption has not been verified. If any quota or provider allowance is uncertain, keep submissions disabled.
- No new Supabase project, branch, paid add-on, or external paid service is part of this work.

## Isolation boundary

Never read or write Mia's private identity, chat, memory, emotion, relationship, life-event, or personality tables. The eventual mailbox backend must use only its dedicated schema and public publication table, with no direct browser access to the private queue or moderation metadata.

## Before enabling submissions

Implement and verify, in order:

1. A dedicated schema with non-exposed private queue, short retention, minimal metadata-only audit, and public read-only publication table.
2. A server-only AGNES adapter with bounded timeouts and a strict no-call path when the zero-cost allowance is not confirmed.
3. Automated input safety/privacy checks and abuse throttling.
4. AGNES semantic selection with a valid no-answer outcome.
5. Mia reply generation only after selection.
6. Automated output review and combined question/answer review.
7. A content-hash-bound, one-time publication authorization enforced by the database transaction.
8. Expiry and withdrawal behavior.
9. Adversarial tests for bypass, replay, duplicate publication, content replacement after review, prompt injection, PII, minors, unsafe content, timeouts, and private-data isolation.
10. A final security review before any public submission endpoint is enabled.

All errors, timeouts, missing checks, and uncertain moderation outcomes must fail closed. Individual submissions are not sent to a human moderator; uncertain items are rejected or discarded automatically.
