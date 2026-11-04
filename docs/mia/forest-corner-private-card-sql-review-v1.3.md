# Forest Corner private card vault — V1.3 SQL review

**Status: isolated candidate amended; latest SQL/Edge changes await fresh CI and independent review; NOT APPROVED FOR EXECUTION**  
**Branch:** `work/forest-corner-card-dry-run-v1`  
**Scope:** static review only. No PostgreSQL instance was contacted and no SQL was executed.

## V1.3.1 static repair note

A source inspection found that the V1.3 SQL text had a truncated SHA-256 predicate and a duplicated SQL tail after the decommission notes. Both were repaired in the isolated branch. A further privilege-path review found that the event guard's row lock (`SELECT ... FOR UPDATE`) would otherwise execute as `service_role`, which intentionally has no UPDATE privilege on cards. The event guard is now a narrowly-scoped `SECURITY DEFINER` trigger function with a pinned search path and schema-qualified references; its owner and effective privileges must be inspected in the disposable database. The V1.3 static guard was strengthened to check lexical closure, balanced parentheses, one transaction boundary, expected function definitions and dollar-quote delimiters, and the complete digest predicate. This is still a structural text guard, not a PostgreSQL parser or execution test. The repaired files require a fresh CI run before this static gate can be considered passed.

## What changed from V1.2

- Replaced `CREATE TABLE IF NOT EXISTS` with a fail-closed preflight that aborts if target tables/functions already exist.
- Removed `DROP TRIGGER IF EXISTS` and `CREATE OR REPLACE FUNCTION`; V1.3 creates uniquely versioned objects and refuses collisions.
- Added per-source SHA-256 digest metadata and a card-level canonical source-manifest digest.
- Added a bounded source-reference JSON structure check, allowlisted source-table names, timestamp and digest shape checks, and an 8 KiB source-reference limit.
- Added serialized event-transition checks using a lock on the card row, plus unique indexes for proposal/review/superseded events.
- Added a narrow atomic card + initial-proposal RPC. It uses a pinned search path, schema-qualified objects, and restricted EXECUTE grants. Direct service-role INSERT on the card table is revoked; the RPC is the intended insert path.
- Added a non-destructive decommission outline.\n- Added a transaction-scoped advisory lock and atomic two-new-cards-per-UTC-day cap in the initial-proposal RPC. Idempotent retries return the original card without consuming another daily slot. The disposable smoke script now attempts a third card and asserts that it fails without leaving a row.

## Remaining blockers and explicit limitations

1. **Earlier PostgreSQL smoke subset passed; amended cap is not yet verified.** PostgreSQL 16.15 accepted the earlier V1.3 SQL revision in an ephemeral container. The later two-card daily cap and third-card rollback assertion have not yet had a fresh Actions run. Actual Supabase function owner, project role grants, RLS bypass behavior, and deployed grants remain unverified.
2. **Source ownership is not proven by SQL.** An Edge Function candidate now exists in `supabase/functions/mia-forest-card-vault/index.ts`. It fetches source rows through a hard-coded allowlist, pins prototype-Mia identity, verifies the exact chat session for `mia_messages`, excludes identifiable AURORA/federation records, and computes canonical digests server-side. It has static checks only so far; Deno type-check, runtime tests, and source fixture tests remain pending. Browser-provided digests are never trusted.
3. **Revision flow is not yet complete.** V1.3 can represent a successor link and guards a `superseded` event, but does not yet provide one atomic revision RPC that inserts the successor, its initial proposal, and the predecessor's superseded event together. Do not enable revision writes until that RPC and its concurrency tests exist.
4. **Review authorization remains an application responsibility.** The candidate requires an authenticated `review` request with an explicit `accepted` or `rejected` decision and sets `actor_scope` server-side. The existing Mia shared-password token is an interim gate, not a separate human identity, device-bound credential, or E2EE.
5. **SECURITY DEFINER requires owner-level scrutiny.** The initial insert RPC is intentionally narrow, uses a pinned search path and schema-qualified references, and revokes browser-role EXECUTE. Before staging, inspect its owner, grants, and effective privileges. Do not add dynamic SQL or broaden its arguments.
6. **Service-role remains highly privileged.** Never expose the service-role key to the browser. Only the dedicated Edge Function may call the RPC or append review events.
7. **Idempotency collision policy.** The RPC returns the original card for a repeated card idempotency key only if its initial proposal event exists. It does not silently repair partial legacy state. Confirm that the caller compares the returned card identity/content where needed.
8. **No automatic emotion capture.** `emotion_residue` remains a permitted classification label, not permission to persist transient emotional fluctuations. Meaningful durable moments only, explicit review, no idle generation.

## Static checks observed

- Proposal is documentation-only and not in `supabase/migrations/`.
- No `IF NOT EXISTS`, `CREATE OR REPLACE`, or `DROP TRIGGER` statements remain.
- Preflight checks target object collisions and expected Supabase roles.
- Both tables enable RLS and revoke all browser-role table privileges.
- Service-role card INSERT is revoked; initial card creation is through the narrow RPC.
- Append-only UPDATE/DELETE/TRUNCATE triggers are declared.
- Source digest metadata, bounded source_refs, transition checks, and rollback notes are present.

These observations do not establish that PostgreSQL accepts or enforces the SQL.

## Disposable PostgreSQL test harness

The isolated GitHub Actions workflow now provisions a fresh `postgres:16` service container, creates synthetic `anon`, `authenticated`, and `service_role` roles, applies the proposal only inside that ephemeral container, and runs synthetic checks for role grants, RLS flags, the atomic RPC, duplicate idempotency, one terminal review, direct-card-insert denial, and RPC rollback after an event-key collision. This container is destroyed with the job. It is not a Supabase staging project and contains no Mia production data. The first full run passed: GitHub Actions run `41825597773` (commit `76f4bc7e2c88895cf965ac0be014f146a464326d`) completed successfully. That run predates the daily-cap amendment. The updated workflow now also runs the Edge Function static guard and a Deno type-check; the current branch revision has not yet been confirmed green. This validates neither Supabase-specific ownership/configuration nor production deployment.

## Required next gates

A. Static CI guard passes and is clearly labelled non-executing.  
B. Independent SQL review checks the exact V1.3 file, including function ownership and security-definer behavior.  
C. Disposable PostgreSQL staging tests cover grants, RLS, append-only triggers, invalid JSON, source digest shape, idempotency, transaction rollback, concurrent reviews, and supersession.  
D. Complete Deno type-check/runtime tests and synthetic source/session/HMAC/review tests for the committed Edge Function candidate.  
E. Add the atomic revision RPC before enabling revisions.  
F. Obtain separate explicit approval before creating any staging resources or deploying anything. Production requires another separate approval.

## Non-actions

The ZHI database was queried read-only for source-schema verification; no production/staging writes or DDL occurred, and the proposal SQL was not executed against Supabase. No table, function, secret, Edge Function, API, chat, personality, memory, emotion, growth, or AURORA configuration was changed. No branch merge occurred.
