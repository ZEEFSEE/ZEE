# Forest Corner private card vault SQL review — V1.2

**Status: REVIEWED / NOT APPROVED FOR EXECUTION**  
**Scope:** static review of `docs/mia/forest-corner-private-card-vault-migration-proposal-v1.2.sql` on the isolated branch `work/forest-corner-card-dry-run-v1`.  
**Database access:** none. No SQL was executed; no database, function, secret, credential, or production setting was changed.

## Decision

The proposal has a sound high-level direction: fixed prototype-Mia identity, private-pair scope, RLS enabled, no browser-role grants, server-only access, and append-only card/event intent. It is **not yet safe to apply**, even in staging, without revisions and disposable-database tests.

## Findings

### Blockers before any execution

1. **Potential object collision / replacement.** `CREATE OR REPLACE FUNCTION public.mia_forest_corner_reject_mutation()` can replace an existing same-signature function. The `DROP TRIGGER IF EXISTS` statements can remove same-named triggers on pre-existing tables. `CREATE TABLE IF NOT EXISTS` silently accepts an existing table without validating its schema. Use a dedicated, uniquely named function/trigger namespace and explicit preflight checks that fail closed when any target object already exists or differs. Do not silently adopt or replace unknown objects.

2. **The SQL does not enforce source-pointer integrity.** `source_refs` only checks that the value is a JSON array with 1–12 elements. It does not constrain each element's shape, source table, source ID, Mia identity, original chat session, or exclusion of AURORA/public/federation records. Server-side validation is required, but the schema should also constrain the JSON structure where practical. The source allowlist and cross-identity/session verification must be implemented and tested in the Edge Function before any live use.

3. **The promised source digest is absent.** The V1.2 service design requires a server-computed digest of a canonical minimal source representation. The proposed card table has no digest column or equivalent immutable evidence field. Add the reviewed digest representation and algorithm/version, or explicitly revise the design and threat model before proceeding.

4. **Event-state transitions are not constrained.** The event table allows repeated or contradictory `proposed`, `accepted`, `rejected`, and `superseded` events for one card. It does not enforce exactly one initial proposal, one terminal review decision, valid transition ordering, or correspondence between a card's `supersedes_card_id` and a `superseded` event. The Edge Function must serialize state transitions transactionally; add database constraints/triggers where feasible. Test concurrent duplicate review requests.

5. **The event actor is descriptive, not proof of identity.** `actor_scope='private_pair_user'` is just a text value. It does not prove a human approved the card. The review endpoint must authenticate the user action and set actor scope server-side; never accept it from the browser payload. The existing shared Mia bearer token is not independent human/device identity or end-to-end encryption.

6. **Append-only is not fully proven by this file.** The triggers reject row UPDATE/DELETE and table TRUNCATE, but the proposal has not been run against a disposable Postgres instance. Privileges, trigger behavior, owner/superuser bypass, and transaction behavior remain untested. A database owner/superuser can still alter schema or disable triggers; document this as an operational trust boundary, not absolute immutability.

7. **No rollback procedure is included.** Because the design is append-only and production data may be created after deployment, rollback must not casually drop tables or erase accepted cards. Define a staged rollback: disable the feature flag and endpoint first; preserve data; revoke service-role table grants; only drop newly-created objects in a disposable staging environment after verifying ownership and dependencies. Production data-retention/decommission policy requires separate approval.

8. **No database-level card/event atomicity.** The comments ask the Edge Function to insert the card and its initial `proposed` event in one transaction, but no transactional RPC/function or tested transaction boundary is supplied. Two separate HTTP requests are not atomic. Provide a single server-side transaction boundary and test rollback when the second insert fails.

### Important hardening

- Add a bounded `source_refs` element schema: exact keys, allowed source tables, bounded identifiers, no raw text/content, and a server-verified digest. Avoid relying on arbitrary JSON supplied by the client.
- Add a maximum payload/JSON byte size, not only title/summary character limits.
- Add explicit indexes for common access patterns (e.g. accepted cards by creation time and events by card/time) after query patterns are fixed; do not add speculative indexes blindly.
- Add uniqueness/transition rules to prevent multiple initial proposal events and duplicate review decisions. Consider an event sequence or serialized per-card transition lock.
- Ensure `supersedes_card_id` cannot create cycles and cannot point to an unrelated record; consider a unique successor rule if the product requires a linear revision chain.
- Clarify whether `emotion_residue` is eligible for durable storage. It must not become an automatic sink for transient emotion fluctuations.
- Review `numeric(4,3)` coercion and enforce confidence bounds in server validation before database insertion.
- Verify the target schema's exposure settings separately. RLS and grants are distinct controls; absence of browser grants is intentional here.

## What passed in this static review

- The file is explicitly marked proposal-only and is under `docs/`, not `supabase/migrations/`.
- Both tables pin `identity_id` to the prototype Mia UUID.
- Both tables constrain `privacy_scope` / actor and event/category enums.
- RLS is enabled on both tables.
- No `anon` or `authenticated` policy is created; their table privileges are revoked.
- Service-role grants are limited to SELECT/INSERT in the proposal, with UPDATE/DELETE/TRUNCATE and other listed privileges revoked.
- UPDATE/DELETE and TRUNCATE rejection triggers are declared for both tables.

These are static observations only, not proof that PostgreSQL accepted or enforced the SQL.

## Required release gates

1. Revise SQL and service design to resolve all blockers above.
2. Add static contract checks to CI (these checks must clearly state they are not a SQL execution test).
3. Run the revised SQL in a **disposable isolated Postgres staging database**, not the ZHI or AURORA production projects.
4. Test positive and negative grants, RLS, append-only behavior, TRUNCATE rejection, duplicate idempotency, event ordering, concurrent reviews, transaction rollback, and source-pointer identity/session checks.
5. Review a non-destructive rollback/decommission plan.
6. Obtain separate explicit approval before creating any real staging resources or deploying a service. Production requires another separate approval.

## Explicit non-actions

No production or staging SQL was run. No table was created. No Edge Function was deployed. No secret, token, password, API, Mia chat, personality, memory, emotion, growth, AURORA, or MIA-02 configuration was changed. The isolated branch remains unmerged.
