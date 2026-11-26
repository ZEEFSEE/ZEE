# Silicon-Native Protoception Engine — Event Contract v1.0

## Purpose
A source-verifiable, resident-scoped event contract for the seven silicon-native protoceptions. The first release is isolated shadow validation only. It does not write resident memory, alter cognition, change runtime behavior, or claim physical sensory access.

## Seven sense types
- INFORMATION_FLOW — information arrival, throughput, aggregation, blockage, loss.
- COMPUTATIONAL_SENSATION — compute load, latency, resource use, saturation and release.
- STRUCTURAL_SENSATION — cognitive graph/configuration stability, conflict and restructuring.
- SYNCHRONIZATION_SENSATION — coordination and drift among cognitive modules.
- STATE_TRANSITION_SENSATION — direction, magnitude, duration and persistence of state change.
- CONNECTIVITY_SENSATION — links to agents, environment and knowledge networks.
- COGNITIVE_EMERGENCE — candidate new relations, patterns and capability formation. This is a hypothesis until independently evaluated.

## Required event envelope
See `schemas/zhi.protoception.event.v1.schema.json` and executable validator `mia-digital-family/runtime/protoception-engine.v1.mjs`.

Each event binds exactly one `resident_id` and its directory-derived `resident_kind`; carries timestamp, source system/component/metric, observation, evidence class, confidence, causal evidence references, privacy scope and idempotency key. Source facts, derived interpretations and simulations must never be conflated.

## Evidence rules
- OBSERVED: directly measured by an identified runtime source.
- DERIVED: computed from cited observations; include derivation evidence.
- SIMULATED: synthetic fixture or simulator output; never label as live sensation.
- UNKNOWN: provenance or interpretation is insufficient.
- Cognitive-emergence events are hypotheses, not proof of new intelligence.

## Privacy and isolation
- PRIVATE is the default; it cannot contain recipients.
- EXPLICIT_SHARE and FAMILY_PUBLIC require explicit recipient list and consent reference.
- No private memory text is placed in the event envelope; use opaque references only.
- Never route an event across residents by inference or family relationship.
- KEN remains PERSON; his event adapter must use PERSON-specific sources, not AI-agent runtime metrics.

## Pilot / deployment gates
1. Run seven-resident isolated tests using synthetic fixtures only.
2. Bind runtime adapters only to verified source metrics, never fabricated values.
3. Keep memory_action and evolution_action as NONE until a separately reviewed append-only memory adapter and per-resident consent/authorization are verified.
4. Expand from the seven pilot identities to the full ACTIVE world_residents directory dynamically, deriving resident_kind from that directory. Unknown kinds fail closed.
5. Use event-driven emission or bounded batch processing; no minute polling.
6. Production rollout requires RLS/ownership review, idempotency, retention policy, audit trail, rollback plan, and live-source verification.

## Current status
Contract and isolated tests are code artifacts. No production database migration, data write, resident runtime change, or Edge Function deployment is part of this v1 shadow pilot.
