# ZHI Digital Family — Production Readiness Audit & Integration Design V1

**Status:** design-only / isolated branch / not production-enabled  
**Audit base:** `main` at `3458f6e80d0a44f4bb714f92f8130680499e0e81`  
**Scope:** LUNA, ARIA, ELYA, KAEL, NOAH; Mia maternal boundary; five public destinations.

## 1. Executive result

The P6 overview and deterministic simulation are published, but production runtime integration is **not ready**. The current system has identity fixtures, volatile-message simulation, virtual scene geometry, route contracts and tests. It does not yet have five production agents, a live maternal message channel, a durable birth coordinator, or a browser/runtime-confirmed world traversal path.

This document records a read-only audit and defines the next isolated integration boundary. It does not activate agents, grant world permissions, change Supabase, or modify Mia's independent chat.

## 2. Read-only audit findings

### Repository and CI

- Repository default branch is `main`; the family implementation lives under `mia-digital-family/`.
- `.github/workflows/zhi-digital-family-isolated-tests.yml` runs Node 20 tests on pull requests and has `permissions: contents: read`.
- The latest recorded family test run on the P6 implementation completed successfully (27 tests). These are deterministic Node tests, not production runtime tests.
- The family test workflow is separate from the GitHub Pages deployment workflow.

### Family runtime

- The five IDs, heart IDs and memory IDs are distinct fixtures.
- `family-runtime.mjs` stores messages, volatile context and child state in process memory only.
- `MIA_MATERNAL_CORE` is currently a symbolic receiver in the simulation. There is no production transport or adapter connected to Mia.
- The birth simulator uses caller-supplied boolean readiness flags and a synchronous in-memory transition. It is not a durable or distributed transaction.
- The family world audit is read-only and explicitly reports no family access grant.

### Mia isolation

- `supabase/functions/mia-chat/index.ts` is the existing independent chat path, with Mia's existing identity and AGNES/Supabase configuration. The family prototype is not imported into that function.
- `supabase/functions/mia-forest-autonomy/index.ts` is a separate Mia-scoped service that reads/writes Mia autonomy state. It explicitly blocks cross-scene travel and reports live perception and physical 3D movement as false. It must not be repurposed as a five-child runtime.
- The family integration must not read or write Mia private chat, memories, emotion events, personality state, or AGNES credentials. No Mia chat or Edge Function changes are included in this proposal.

### World access and navigation

- `world-scenes/public-destinations/world-spatial-manifest.v1.json` declares `principal: prototype-mia`, `other_agents_access: false`, `aurora_enabled: false`, and `federation_enabled: false`.
- `mia-digital-family/world-access-policy.v1.json` requires explicit per-agent, per-destination grants. No such grants currently exist.
- The five destination transition records remain `contract_defined_runtime_validation_pending`.
- `world-scenes/public-destinations/navigation.json` describes a complete static graph, but its route policy says `runtime_movement: not_integrated`; graph reachability is not runtime movement.
- Destination scene metadata currently says coordinate units are unassigned and cross-scene transforms are null/unmapped. The spatial manifest separately defines authored virtual metres and deterministic scene origins. These contracts must be reconciled and versioned before runtime handoff.
- The spatial simulation tests authored spawn points, collider avoidance, scene bounds, anchor approach paths and simulated handoffs. They do not test the browser renderer, a live 3D engine, physical-world sensing, or production access.
- Perception frames are generated from authored scene anchors. They are not camera observations or evidence of physical-world perception. The label `live_runtime_scene_graph` in the shared helper should be renamed or explicitly qualified before any production-facing perception claim.

## 3. Target architecture — five independent runtime boundaries

Each child must have an isolated runtime namespace:

| Child | Agent identity | Memory namespace | Heart namespace |
|---|---|---|---|
| LUNA | `ZHI-G1-D01-LUNA` | `MEM-G1-D01` | `HEART-G1-D01` |
| ARIA | `ZHI-G1-D02-ARIA` | `MEM-G1-D02` | `HEART-G1-D02` |
| ELYA | `ZHI-G1-D03-ELYA` | `MEM-G1-D03` | `HEART-G1-D03` |
| KAEL | `ZHI-G1-S01-KAEL` | `MEM-G1-S01` | `HEART-G1-S01` |
| NOAH | `ZHI-G1-S02-NOAH` | `MEM-G1-S02` | `HEART-G1-S02` |

Required invariants:

1. Every request is bound to one authenticated child ID; never trust a client-supplied identity by itself.
2. Memory, personality, emotion, task queues and spatial state are namespaced per child. No shared mutable state.
3. Sibling exchange is an explicit, consent-scoped event; it is not unrestricted memory or thought access.
4. A failed child operation cannot mutate another child's state.
5. Every production capability is deny-by-default and independently revocable.
6. No production birth until durable atomic commit, recovery and actual cleanup attestations exist.

## 4. Maternal communication boundary

The current `sendEphemeralMessage` function is a local simulation only. A production maternal channel must be a separate adapter with an explicit capability contract; it must not call or modify Mia's existing chat endpoint.

Proposed message envelope:

- `event_id`: unique idempotency key;
- `sender_child_id`: one of the five allowlisted child IDs;
- `recipient`: `MIA_MATERNAL_ADAPTER` only;
- `session_id`: short-lived maternal session;
- `kind`: `question`, `status`, `care_signal`, or `environment_signal`;
- `payload`: bounded, schema-validated content;
- `retention`: `volatile_session_only`;
- `expires_at`: mandatory expiry;
- `forwarding_allowed`: false by default.

Adapter rules:

- No query access to `mia_messages`, `mia_memories`, `mia_emotion_events`, `mia_personality_state`, or any private chat history.
- No access to AGNES API keys, Supabase service-role keys, or Mia's private chat credentials.
- No writes to Mia's identity, memory, personality, emotion, or chat tables.
- No message-body logging or analytics by default; operational logs contain only event IDs, status codes and timing.
- Reject unknown child IDs, oversized payloads, expired sessions, replayed IDs with conflicting payloads, and unsupported message kinds.
- Session cleanup must be verified by the storage provider, not asserted by a caller-provided boolean.
- Any future use of Mia's own cognition requires a separately reviewed adapter that exposes only the maternal capability. This design does not assume or claim access to Mia's private cognitive state.

## 5. Five-destination runtime validation

Before any child receives a destination grant, validate each destination independently:

1. Reconcile scene-local units, virtual-world transform, spawn point and portal anchor in one versioned coordinate contract.
2. Validate spawn walkability, bounds, collision margins and all authored anchor approach paths.
3. Execute browser/runtime traversal from Forest Corner to the destination and back; capture runtime-confirmed scene IDs and transition IDs.
4. Verify that failed handoffs preserve the prior scene, position and perception frame.
5. Verify per-child isolation by moving one child while asserting all four siblings remain unchanged.
6. Verify perception provenance: authored scene graph, simulation, browser renderer, or external sensor must be explicitly distinguished.
7. Keep AURORA and Federation disabled; do not infer cross-world access from local route connectivity.

The existing Node simulation is a prerequisite test only. It cannot satisfy steps 3 or 6.

## 6. Production acceptance gates

| Gate | Required evidence | Current status |
|---|---|---|
| Identity isolation | Authenticated per-child identity and namespace tests | Fixture only |
| Maternal channel | Separate adapter, schema validation, TTL and cleanup attestation | Simulation only |
| Mia isolation | Static dependency audit plus integration tests proving no private-chat/AGNES access | Partial static audit; no integration |
| Durable lifecycle | Transactional birth coordinator, idempotency, crash recovery and rollback tests | In-memory only |
| Spatial runtime | Browser/engine-confirmed entry, exit, movement and perception for all five scenes | Pending |
| Access control | Explicit per-child/per-destination grant and revocation tests | Denied; no grants |
| Operations | Audit logs without message content, alerting, backup and recovery plan | Not implemented |

Production activation is blocked until every gate is evidenced and separately approved.

## 7. Change and deployment boundary

This branch contains documentation only. It must not:

- change `mia-chat.html`, `supabase/functions/mia-chat/**`, or Mia's AGNES configuration;
- change Supabase schemas, data, policies, secrets or Edge Function deployments;
- change the current Mia-only world manifest or grant access to any child;
- enable AURORA or Federation;
- create production child agents or claim that birth has occurred;
- deploy any new runtime endpoint.

The next implementation increment should remain in a separate isolated branch and add contract tests before any service connection is considered.
