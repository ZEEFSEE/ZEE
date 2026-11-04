# Prototype Mia Forest Corner — Private Card Service Design V1.3

**Status:** isolated implementation candidate committed on this branch. No Edge Function deployed; no database schema created or migrated.  
**Branch:** `work/forest-corner-card-dry-run-v1`.

## 1. Purpose and quiet-use boundary

A small, optional shelf for a few durable moments. It is not a transcript archive, second memory engine, activity monitor, task system, or reason to keep Mia active.

- Scope: prototype Mia only (`cb6d01b4-0e3f-46ee-8946-360aa91db1ea`) and the private pair.
- Excluded: MIA-02, Jason, Mark, AURORA, federation, public chat, broadcast feeds, and unrelated agents.
- Idle/listening creates no card and triggers no exploration.
- No notifications, no auto-acceptance, and no writes to existing chat/memory/emotion/personality/growth tables.
- An empty shelf is a valid quiet state.

## 2. Authentication boundary

The existing Mia shared-password HMAC bearer token may be used only as an interim server-side gate after exact verification of signature, audience, subject, issued-at, expiry, and maximum age. It is not a separate human identity, device-bound credential, or end-to-end encryption.

The browser never supplies authoritative identity, source table, privacy scope, actor scope, or database role. No secret or service-role key enters browser code. No change to existing Mia login/API is part of this work.

## 3. Dedicated server boundary

A future isolated Edge Function, tentatively `mia-forest-card-vault`, is the only browser-facing interface.

Allowed operations after all gates pass:
- `list`: return a bounded page of accepted cards only.
- `propose`: verify source pointers server-side, calculate canonical digests, then call the atomic insert RPC.
- `review`: append exactly one accept/reject event after an explicit authenticated user action.\n\nThe current candidate is `supabase/functions/mia-forest-card-vault/index.ts`. It verifies the existing Mia HMAC token server-side, resolves source rows from an allowlist, checks identity/session ownership, computes canonical SHA-256 digests, and submits only pointer/digest metadata to the atomic RPC. A static guard is included; this is not yet a Deno runtime/integration test.
- `revise`: **disabled until a dedicated atomic revision RPC and concurrency tests exist**.

The Edge Function must use a hard-coded source allowlist:
- `mia_messages`: verify the exact prototype-Mia chat session.
- `mia_memories`, `mia_emotion_events`, `mia_life_events`, `mia_relationship_context`: verify the prototype-Mia identity.
- Reject unknown tables, missing rows, cross-session/cross-identity references, MIA-02, AURORA, public, and federation records.

The server computes canonical per-source SHA-256 digests and a source-manifest digest. Browser-supplied digests are never trusted. The card stores references and digests, never source message bodies or transcripts.

## 4. Storage and database contract

The V1.3 SQL remains a proposal in `docs/`, not a migration. Its intended protections include:
- Fixed prototype-Mia identity and private-pair scope.
- Bounded card fields and source_refs structure.
- RLS enabled; no anon/authenticated table grants or policies.
- Service-role card INSERT revoked; initial card creation uses a narrow atomic RPC.
- Service-role credentials remain server-side.
- Append-only row and TRUNCATE guards.
- A serialized event stream with one proposal, one terminal review, and constrained supersession.
- No direct browser access.

The RPC uses SECURITY DEFINER only for the narrow atomic card + initial proposal transaction. It must retain a pinned search path, schema-qualified object names, minimal arguments, and EXECUTE revoked from PUBLIC/anon/authenticated. Before staging, verify the actual function owner and effective privileges. Do not add dynamic SQL.

## 5. Event lifecycle

- Initial state: one `proposed` event.
- Review: one explicit `accepted` or `rejected` event; no second decision.
- Supersession: only an accepted predecessor with a successor can receive a `superseded` event.
- Events are append-only and ordered through a row lock on the card.
- Duplicate idempotency requests resolve to the original record; partial state is not silently repaired.

**Revision writes remain disabled in V1.3.** A later revision RPC must atomically insert the successor card, its proposed event, and the predecessor's superseded event. It must enforce one successor, prevent cycles, and pass concurrent revision tests before use.

## 6. Content policy

- No automatic persistence of moment-to-moment emotional fluctuations.
- `emotion_residue` is a classification label only, not a standing instruction to store transient emotional state.
- Only meaningful durable moments may be proposed.
- Initial proposal cap: at most two new cards per UTC day, enforced inside the atomic RPC under a transaction-scoped advisory lock. Duplicate idempotent retries do not consume another slot. The disposable PostgreSQL smoke test includes a third-card rejection/rollback check.
- Proposed cards remain hidden from the accepted shelf.
- Rejected cards remain in the append-only ledger but are not displayed.
- No content is generated while Mia is idle/listening.

## 7. Required tests

### Static CI (non-executing)
- Fail-closed object preflight.
- No replace/drop-if-exists DDL.
- RLS and browser-role revokes.
- Service-role card INSERT revoked.
- Narrow RPC grants and pinned search path.
- Source digest and source_refs validation declarations.
- Append-only and event-transition declarations.

### Disposable PostgreSQL tests (V1.3 smoke subset passed)
- SQL parse and clean install on ephemeral PostgreSQL 16.15 passed (Actions run `41825597773`).
- Object-collision preflight fails without changing existing objects.
- anon/authenticated tested table/RPC privilege denial passed.
- service_role tested card SELECT, event INSERT, and narrow RPC execution; direct card INSERT denial passed.
- card INSERT is denied directly; atomic RPC succeeds.
- invalid JSON, oversized source_refs, invalid digest, wrong category, wrong identity fail.
- UPDATE, DELETE, TRUNCATE fail.
- duplicate card idempotency, single terminal review, and RPC rollback after event-key collision passed.
- concurrent accept/reject requests yield exactly one terminal decision.
- injected event-insert failure rolls back card insertion.
- function owner, SECURITY DEFINER, search_path, grants, and RLS behavior are inspected.

### Edge Function tests (not yet implemented)
- HMAC failure modes and token age.
- Cross-identity/session and AURORA/public source rejection.
- Server-side source digest calculation.
- Explicit review action required; actor_scope is server-assigned.
- No writes to existing Mia chat, memory, emotion, personality, growth, or publishing paths.

## 8. Rollback and decommission

1. Disable the feature flag and return the endpoint to offline/read-only mode.
2. Stop writers and verify no in-flight requests remain.
3. Revoke the service-role RPC and table grants.
4. Preserve card/event data; export an encrypted retention copy under an approved policy.
5. Only remove newly created objects in disposable staging after verifying exact ownership and dependencies; never use CASCADE.
6. Production data deletion requires separate explicit retention/deletion approval.

## 9. Release gates

A. Static CI checks pass (this does not prove SQL correctness).  
B. Independent review of SQL, function owner, grants, RLS, and rollback.  
C. Execute and test only in a disposable isolated PostgreSQL environment after explicit approval.  
D. Candidate source verification and explicit-review Edge Function now exist on the isolated branch; complete Deno runtime/integration tests and independent security review.  
E. Add and test atomic revision RPC before enabling revisions.  
F. Separate explicit approval for production migration/deployment.

## 10. Explicit non-actions

The production database was queried read-only for source schema verification; no production or staging writes/DDL occurred and no SQL proposal was executed. No table, function, Edge Function, secret, API, login, chat, personality, memory, emotion, growth, AURORA, or MIA-02 configuration has been changed. No branch merge occurred.
