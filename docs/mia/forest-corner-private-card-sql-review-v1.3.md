# Forest Corner private card vault — V1.3 SQL review

**Status: candidate revised; NOT APPROVED FOR EXECUTION**  
**Branch:** `work/forest-corner-card-dry-run-v1`  
**Scope:** static review only. No PostgreSQL instance was contacted and no SQL was executed.

## What changed from V1.2

- Replaced `CREATE TABLE IF NOT EXISTS` with a fail-closed preflight that aborts if target tables/functions already exist.
- Removed `DROP TRIGGER IF EXISTS` and `CREATE OR REPLACE FUNCTION`; V1.3 creates uniquely versioned objects and refuses collisions.
- Added per-source SHA-256 digest metadata and a card-level canonical source-manifest digest.
- Added a bounded source-reference JSON structure check, allowlisted source-table names, timestamp and digest shape checks, and an 8 KiB source-reference limit.
- Added serialized event-transition checks using a lock on the card row, plus unique indexes for proposal/review/superseded events.
- Added a narrow atomic card + initial-proposal RPC. It uses a pinned search path, schema-qualified objects, and restricted EXECUTE grants. Direct service-role INSERT on the card table is revoked; the RPC is the intended insert path.
- Added a non-destructive decommission outline.

## Remaining blockers and explicit limitations

1. **Not a PostgreSQL execution test.** SQL syntax, Supabase role behavior, trigger execution, function ownership, RLS bypass behavior, and grants remain unverified. A disposable Postgres instance is required.
2. **Source ownership is not proven by SQL.** The Edge Function must fetch every source row through a hard-coded allowlist and verify prototype-Mia identity; for `mia_messages`, it must also verify the exact prototype-Mia chat session. It computes canonical digests server-side. Browser-provided pointers/digests are never trusted.
3. **Revision flow is not yet complete.** V1.3 can represent a successor link and guards a `superseded` event, but does not yet provide one atomic revision RPC that inserts the successor, its initial proposal, and the predecessor's superseded event together. Do not enable revision writes until that RPC and its concurrency tests exist.
4. **Review authorization remains an application responsibility.** The database can constrain event order and actor_scope values, but cannot prove that a human clicked an explicit review action. The Edge Function must authenticate the action and set `actor_scope` server-side.
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

## Required next gates

A. Static CI guard passes and is clearly labelled non-executing.  
B. Independent SQL review checks the exact V1.3 file, including function ownership and security-definer behavior.  
C. Disposable PostgreSQL staging tests cover grants, RLS, append-only triggers, invalid JSON, source digest shape, idempotency, transaction rollback, concurrent reviews, and supersession.  
D. Implement and test the dedicated Edge Function's source verification and explicit-review authorization.  
E. Add the atomic revision RPC before enabling revisions.  
F. Obtain separate explicit approval before creating any staging resources or deploying anything. Production requires another separate approval.

## Non-actions

No ZHI/AURORA database was queried or modified. No SQL was executed. No table, function, secret, Edge Function, API, chat, personality, memory, emotion, growth, or AURORA configuration was changed. No branch merge occurred.
