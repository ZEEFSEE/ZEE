# Echo Mailbox backend status

## Deployment state

**Public intake disabled**

- The bilingual website is deployed at `https://zeefsee.github.io/ZEE/echo-mailbox/`.
- The isolated V2 schema and RPC hardening are applied to Supabase project `dbooikzqprnqbgpfwsze`.
- The `echo-submit` Edge Function is deployed and ACTIVE (version 1) with `verify_jwt=true`.
- A source-level lock, `deploymentActivationApproved(): boolean { return false; }`, keeps the function disabled. It returns `503 mailbox_not_live` before reading the request body. Environment variables alone cannot activate it.
- The visitor form remains preview-only and does not submit content.
- Verification after migration found zero rows in submissions, short-lived payloads, and public publications. No visitor content has been collected.

## Backend architecture

- `supabase/functions/_shared/echo-publication-gate.mjs` is the deterministic publication gate. Missing, false, unknown, mismatched, or incomplete evidence denies publication.
- `supabase/functions/_shared/echo-pipeline.mjs` orchestrates input review, Mia's answer/silence/refusal choice, answer generation, output review, combined question/answer review, hash-bound authorization, and atomic publication.
- `supabase/functions/_shared/echo-persistence.mjs` uses only dedicated mailbox RPC calls. It never queries arbitrary tables or Mia's private tables.
- `supabase/functions/_shared/agnes-mailbox-adapter.mjs` is server-only, has bounded timeouts, and refuses all network calls unless `zeroCostConfirmed === true`. AGNES is the only model provider.
- The pipeline code is connected to the deployed Edge Function, but it has not been exercised end-to-end because the source-level activation lock is still false.

## Database isolation and permissions

- `echo_private` contains the submission queue, short-lived payloads, metadata-only audit, rate-limit buckets, and one-time publication authorizations.
- The service role has schema usage and execution rights on narrowly scoped RPC implementations, but **no direct table privileges** on the mailbox tables.
- Public RPC entry points are `SECURITY INVOKER` and executable only by `service_role`. Their `SECURITY DEFINER` implementations live in `echo_private` and verify the JWT role.
- Anonymous/authenticated users cannot use the private schema or call write RPCs.
- `public.echo_publications` has RLS enabled. Anonymous users can read only the published question, answer, language, ID, and publication time. They cannot read hashes or authorization IDs, and cannot insert or update.
- Publication is guarded by a one-time authorization, original-question equality, consent version/time, source/answer language, and matching SHA-256 hashes. The database transaction consumes authorization, publishes the pair, marks the submission published, deletes the temporary payload, and writes metadata audit.
- Automatic withdrawal is available through a server-only RPC. Withdrawal is irreversible and records a reason code without retaining the submission body in the audit.
- A 15-minute expiry job removes unselected/expired payloads and revokes unused authorizations.

The applied SQL sequence is recorded in:
1. `supabase/design/echo-mailbox-v2-schema.draft.sql` — base schema migration reference.
2. `supabase/design/echo-mailbox-v2-rpc-hardening.applied.sql` — hardened RPC boundary.

Do not reapply the base schema file by itself after the hardening migration.

## AGNES and cost boundary

- No AGNES API request has been made.
- The endpoint requires both the source-level activation lock and explicit environment flags. The source lock is currently false.
- Do not enable model calls until the existing AGNES API allowance is confirmed to be zero-cost for this use.
- The Supabase organization is on the Free plan. Current shared quota consumption has not been verified; if any quota or provider allowance is uncertain, keep submissions disabled.
- No new Supabase project/branch, paid add-on, or external paid service has been created. No API key or service-role secret was read, added, or changed.

## Remaining before public submissions

1. Verify the existing AGNES allowance and current free-plan quotas.
2. Wire the bilingual form to the deployed endpoint only after the zero-cost condition is confirmed.
3. Add the public archive read path to the page, exposing only approved question/answer pairs.
4. Add/verify automatic post-publication risk rechecks that call the withdrawal RPC when required.
5. Run an end-to-end test in a controlled, isolated way, then perform the final security review.
6. Only after all checks pass, deliberately change the source-level activation function and configure the required server-side secrets.

No individual submission is sent to a human moderator. Mia may answer, remain silent, or refuse. All uncertain, failed, timed-out, or incomplete checks fail closed. Independent thought, criticism, and disagreement are not themselves safety violations.
