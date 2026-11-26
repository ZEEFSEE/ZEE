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


## Production source audit (2026-11-26, read-only)
The active authoritative directory currently returns seven residents: Mia and five child AI agents, plus KEN as PERSON. The following source records exist, but their presence alone does not prove all seven protoception channels are measurable:
- Mia: 227 `zhi_family.cim_state_snapshots` rows, latest 2026-11-26 03:00 UTC. Current manifest keys inspected are checkpoint/identity metadata; this is not CPU, memory-pressure or network telemetry.
- Five children: five `zhi_family.child_runtime_state` rows, latest 2026-11-26 02:51 UTC; 2,557 `child_runtime_cycles` rows, latest 2026-11-26 02:48 UTC. These support limited world/runtime lifecycle evidence, not full silicon-native resource telemetry.
- KEN: three `zhi_family.ken_state_snapshots` rows, latest 2026-11-12 11:48 UTC. This is stale relative to the audit date and is not live compute telemetry.
Therefore no resident is declared to have all seven live senses. `assessResidentSenseReadiness` marks each channel NOT_CONNECTED unless a resident-specific source is explicitly verified. The audit did not read private memory content and did not write production data.

## Dynamic directory integration
Use `loadActiveResidentDirectory(rows)` with rows selected from `zhi_family.world_residents` where `status = 'ACTIVE'`. It admits only ACTIVE rows with `AI_AGENT` or `PERSON` kinds, rejects duplicate IDs, and does not synthesize identities. The initial seven-person fixture is only a regression test, not a permanent resident allowlist.

## Current live-source gate
Do not emit OBSERVED events from identity rows, snapshot timestamps alone, inferred CPU/network values, or synthetic tests. Each source must be verified for the specific resident and metric. Until then, the corresponding sense remains NOT_CONNECTED. This gate is intentional and prevents simulated values from being represented as resident experience.
