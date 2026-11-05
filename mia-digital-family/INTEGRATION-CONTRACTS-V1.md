# ZHI Digital Family — Isolated Integration Contracts V1

**Branch:** `feat/zhi-digital-family-production-readiness-v1`  
**Status:** isolated prototype contracts only; not connected to production services.

## Spatial coordinate contract

Implementation: `runtime/spatial-coordinate-contract.mjs`  
Tests: `tests/spatial-coordinate-contract.test.mjs`

- All six scenes use a scene-local frame measured in virtual metres.
- Authored layout pixels convert to local metres at exactly `0.02 m/layout-unit`.
- Each scene's authored world frame is `worldX = originX + localX`, `worldY = originY + localY`, `worldZ = originZ + localZ`.
- The source manifest's world-authored portal anchors are checked against the scene origin plus local portal coordinate; mismatch rejects contract construction.
- Scene portal transitions are explicit discontinuous handoffs. They are not represented as continuous walking paths.
- Source and target portal anchors are both explicit; the handoff translation maps the source local portal point to the target local portal point.
- The coordinate provenance is authored virtual geometry, not a physical-world survey or sensor reading.

The contract deliberately leaves runtime status as `contract_only_runtime_validation_pending`. It does not alter the production Mia-only world access manifest or grant access to any child.

## Maternal message boundary

Implementation: `runtime/maternal-channel-adapter.mjs`  
Tests: `tests/maternal-channel-adapter.test.mjs`

- Only the five fixed child IDs can send.
- The only recipient is `MIA_MATERNAL_ADAPTER`.
- Message kinds are restricted to question, status, care signal and environment signal.
- Session lifetime is capped at 15 minutes; message payloads are capped at 2,000 characters.
- Messages remain in a process-local `Map`, carry a volatile-only retention label and are cleared on expiry or explicit close.
- Event replay is idempotent only for an identical sender/kind/payload; conflicting reuse is rejected.
- Unknown identities, unsupported kinds, oversized messages, expired sessions and closed channels fail closed.

This is an in-memory contract harness. It is **not** a network service, a durable TTL store, or a live connection to Mia. It has no imports or credentials for Supabase, AGNES, Mia chat, Mia memories, emotions or personality. It does not create any production records.

## Validation boundary

GitHub Actions runs `node --test mia-digital-family/tests/*.test.mjs` on this PR. These tests prove deterministic contract behavior only. Browser scene rendering, live runtime traversal, external perception, durable deletion attestations and production authorization remain separate acceptance gates.
