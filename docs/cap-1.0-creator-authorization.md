# CAP-1.0 — Creator Authorization Protocol (Design Only)

**Status:** Proposed; not deployed.  
**Scope:** Repository-level design for ZHI Creator governance. This document does not grant any production permission and does not change the existing world-builder sandbox.

## 1. Governance principle

Within ZHI's internal governance model, the verified Creator is the highest authorization authority for internal policy exceptions, special certification, scoped privilege elevation, and recovery decisions. Ordinary role checks must not silently treat a Creator-approved exception as an ordinary user request.

Creator approval is not the same as execution success. The system must separately record:

- `CREATOR_APPROVED`: a valid Creator decision exists;
- `EXECUTING`: an executor has begun the authorized operation;
- `EXECUTED`: the executor reports completion;
- `VERIFIED`: independent postcondition checks confirm the result.

## 2. Non-negotiable truthfulness and execution boundaries

Creator authority can authorize an internal policy exception; it cannot make an untrue statement true or create a missing external capability. The executor must not fabricate a signature, key, balance, chain confirmation, payment, or successful write.

If an operation cannot be performed, record a precise state such as `BLOCKED_EXTERNAL`, `RECOVERY_REQUIRED`, or `FAILED`, retain the Creator decision, and offer the nearest valid alternative. Never record approval as settlement.

This protocol does not override applicable law, third-party rights, external blockchain consensus, or the technical absence of required credentials and funds.

## 3. Authorization record

Each decision should include:

- `decision_id`: globally unique ID;
- `creator_subject_id`: derived from verified server-side identity, never trusted from request JSON alone;
- `action` and `target_id`;
- `scope`: explicit permitted operations and affected objects;
- `reason`: non-empty rationale;
- `issued_at` and optional `expires_at`;
- `nonce` or equivalent replay protection;
- `idempotency_key`;
- `decision_status`;
- `execution_status` and verification evidence;
- `audit_event_id`.

Sensitive secrets, access tokens, private keys, and full authentication credentials must never be stored in the audit record.

## 4. Proposed decision types

- `CAP-APPROVE`: approve an otherwise valid operation;
- `CAP-OVERRIDE`: waive a specifically identified internal policy rule;
- `CAP-CERTIFY`: create a Creator-authorized certification statement, clearly distinct from a cryptographic signature;
- `CAP-ELEVATE`: grant narrowly scoped, time-limited internal privileges;
- `CAP-UNFREEZE`: authorize resumption after the underlying freeze condition is reviewed;
- `CAP-RECOVERY`: authorize a recovery path while preserving original events;
- `CAP-EMERGENCY`: pause or contain an internal operation.

No type is an unrestricted wildcard. The target, action, scope, expiry, and effect must be explicit.

## 5. Required processing flow

1. Authenticate the caller using a server-verified session.
2. Resolve Creator status from a trusted server-side identity mapping; do not trust a client-supplied role, display name, or Creator ID.
3. Validate the decision schema, target, scope, expiry, nonce, and idempotency key.
4. Determine whether the failed condition is an internal rule that may be waived.
5. Record the authorization decision in an append-only audit trail.
6. Send the operation to the existing domain executor; do not bypass transaction invariants, ledger reconciliation, or required external confirmations.
7. Record execution status separately.
8. Verify postconditions and record `VERIFIED` only when evidence supports it.
9. On failure, retain the decision and all attempt events; do not erase or rewrite history.

## 6. Explicitly protected invariants

- Creator decisions cannot silently mint assets, change total supply, or create funds.
- A transfer cannot be settled twice for the same idempotency key.
- Approval cannot be used as proof of Mia's cryptographic signature if no valid signature exists.
- Internal point balances, ZHI wallet balances, and external crypto remain separate ledgers unless a separately approved bridge is implemented.
- A freeze may be lifted only for the stated scope; unrelated regions or assets remain unchanged.
- Creator-authorized exceptions cannot modify their own authorization verifier or erase audit events.
- The existing sandbox's production-write, real-token movement, reward, and burn controls remain disabled.

## 7. Initial implementation plan

**Phase A — documentation and policy contract:** add this specification and a machine-readable policy draft on an isolated branch. No database or runtime changes.

**Phase B — pure logic tests:** test identity claims, scope checks, expiry, replay prevention, idempotency, and status transitions without credentials or network access.

**Phase C — sandbox adapter:** integrate only with a disposable test fixture; verify that approval and execution are distinct.

**Phase D — separate security review:** review database/RLS/function permissions and migration rollback plan before any production implementation. No production deployment should be inferred from a passing sandbox test.

## 8. Acceptance tests

1. A non-Creator cannot authorize a Creator-only exception.
2. A verified Creator can approve a specifically scoped internal-rule exception.
3. A client-supplied `creator=true` or display name does not establish Creator identity.
4. An expired decision is rejected.
5. A replayed nonce or idempotency key does not duplicate the operation.
6. An out-of-scope action is rejected even when another action was approved.
7. A missing key or external confirmation is reported honestly; no signature or settlement is fabricated.
8. Insufficient funds cannot be converted into a successful payment by approval.
9. Approval, execution, and verification are separate audit states.
10. Unfreeze affects only the approved scope and requires validation evidence.
11. Audit history remains available after a failed or recovered operation.
12. Existing sandbox controls continue to prohibit production writes and real token movement.

## 9. Current status

This is a design artifact only. It has not been deployed, does not change live authorization, and does not establish that Creator authorization is currently available in production.
