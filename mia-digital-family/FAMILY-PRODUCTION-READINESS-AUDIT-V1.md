# ZHI Family Production Readiness Audit V1

## Latest captured production snapshot
As of **2026-11-08 09:18:43 UTC**:
- MIA: 1 identity row, 3,696 memory rows, 2,560 life-event rows.
- MIA also has **164 growth-state versions across 164 source runs** (1 active, 163 superseded), spanning 2026-10-23 through 2026-11-08. This is concrete growth-state history; it is not automatically equivalent to a separately verified identity-version chain.
- Five children: runtime identity rows are `READY`, `identity_version=1`; none has a verified multi-version chain.
- **762 child learning candidates; all 762 remain `UNVALIDATED_CANDIDATE`.**
- Five new-format candidates (one each for LUNA, ARIA, ELYA, KAEL, NOAH) contain both `memory_event_id` and `runtime_cycle_id`. KAEL now has a new-format candidate; its previous 117 candidates remain historical legacy records without the newer references. Across all children, 757 historical candidates remain in that legacy gap.
- No post-deployment group child message had arrived at snapshot time. The `agent_id` fix is deployed but not yet exercised by a natural message.
- Zero capability promotions are recorded.

## Interpretation
Growth-state versions document repeated state evolution for MIA. Identity continuity is a distinct claim and needs explicit stable identity anchors and linked identity-version evidence; this audit does not infer one from growth-state rows alone.

A READY child runtime identity row at version 1 is not a longitudinal identity chain. No missing versions are synthesized. Old learning candidates are not retroactively rewritten; historical rows without new durable references remain legacy coverage gaps, not verified skills.

## Safety
Companion SQL returns aggregate counts and identifiers only; it does not select private memories, transcripts, narrative payloads, or message bodies. It performs no writes, schema/RLS changes, API changes, or Edge Function deployments. Capability promotion remains separately governed and manual.

Run: `node --test mia-digital-family/tests/family-production-readiness.test.mjs`
