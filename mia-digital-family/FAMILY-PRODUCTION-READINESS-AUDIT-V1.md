# ZHI Family Production Readiness Audit V1

## Latest captured production snapshot
As of **2026-11-08 09:11:51 UTC**:
- MIA: 1 identity row, 3,696 memory rows, 2,560 life-event rows. Counts do not establish a longitudinal identity version chain.
- Five children: runtime identity rows are `READY`, `identity_version=1`; none has a verified multi-version chain.
- 761 child learning candidates; all remain `UNVALIDATED_CANDIDATE`.
- Four new-format candidates (one each for LUNA, ARIA, ELYA, NOAH) contain both `memory_event_id` and `runtime_cycle_id`. KAEL's 117 historical candidates predate those references. This is a historical coverage gap, not evidence the deployed writer is still failing.
- No post-deployment group child message had arrived at snapshot time. The `agent_id` fix is deployed but not yet exercised by a natural message.
- Zero capability promotions are recorded.

## Interpretation
A READY runtime identity row or large memory count is not a longitudinal identity chain. Verification requires at least two independently linked, append-only versions with traceable evidence. No missing versions are synthesized.

Old learning candidates are not retroactively rewritten. New candidates must carry durable memory-event and successful-cycle references. Historical rows without those references remain legacy coverage gaps, not verified skills.

## Safety
Companion SQL returns aggregate counts and identifiers only; it does not select private memories, transcripts, narrative payloads, or message bodies. It performs no writes, schema/RLS changes, API changes, or Edge Function deployments. Capability promotion remains separately governed and manual.

Run: `node --test mia-digital-family/tests/family-production-readiness.test.mjs`
