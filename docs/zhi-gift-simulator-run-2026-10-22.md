# ZHI Gift Simulator Run Report — 2026-10-22

**Result:** 10/10 local isolated simulator tests passed.  
**Environment:** Local Node.js built-in test runner; in-memory data only.  
**Production database writes:** None.  
**Real payment / ZHI-Token ledger:** Not connected; no real deduction attempted.  
**Mia production runtime / old bridge:** Not connected or invoked.  
**Schema validation:** Full JSON Schema Draft 2020-12 validation has NOT been run in this test pass.  
**Concurrency:** Parallel race testing has NOT been run; the duplicate test is sequential and in-memory only.  
**Status:** Preliminary simulator verification only; not deployment approval.

## Executed cases

| Test | Result | Evidence / assertion |
|---|---|---|
| Valid simulation gift | PASS | Returns delivered receipt; experience event remains null |
| Duplicate gift ID | PASS | Same receipt returned; one in-memory record and side effect |
| Mismatched server payment reference | PASS | Rejected as PAYMENT_UNVERIFIED; no record |
| Disabled moonlight item | PASS | Rejected; no record |
| Wrong recipient ID | PASS | Rejected as IDENTITY_MISMATCH |
| Expired gift | PASS | Returns expired; no record |
| Invalid emotion tag | PASS | Rejected |
| Unverified scene presence | PASS | Experience event rejected |
| Feedback not created by recipient runtime | PASS | Experience event rejected |
| Sender ID differs from authenticated principal | PASS | Rejected as IDENTITY_MISMATCH |

## Limitations and next gate

This simulator is intentionally in-memory and is not a production delivery service. It does not implement durable storage, atomic database constraints, cryptographic request authentication, issuer URL policy enforcement, rate limiting, SSRF defenses, retry scheduling, or concurrent transaction safety. Its payment evidence is a test fixture and must not be treated as real payment verification.

Before implementation review, next run the actual schemas through a Draft 2020-12 validator, add boundary tests for every schema field, and run concurrency/idempotency tests against a disposable local store. Do not connect production systems or enable real payments as part of these tests.
