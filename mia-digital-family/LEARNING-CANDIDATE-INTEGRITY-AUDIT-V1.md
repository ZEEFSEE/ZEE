# ZHI Production Learning Candidate Integrity Audit V1

**Audit timestamp:** 2026-11-08 08:43:03 UTC  
**Project:** `zee-extension` / `dbooikzqprnqbgpfwsze`  
**Mode:** read-only production SQL; redacted aggregate snapshot  
**Writes:** none

## Verified production findings

| Child | Candidate events | Unvalidated | Same-owner memory refs | Successful source cycles | Durable maternal refs |
|---|---:|---:|---:|---:|---:|
| LUNA | 167 | 167 | 167 | 167 | 15 / 26 |
| ARIA | 155 | 155 | 155 | 155 | 4 / 13 |
| ELYA | 170 | 170 | 170 | 170 | 12 / 24 |
| KAEL | 116 | 116 | 116 | 116 | 7 / 8 |
| NOAH | 148 | 148 | 148 | 148 | 3 / 10 |
| **Total** | **756** | **756** | **756** | **756** | **41 / 81** |

All 756 rows are `REFLECTION_LEARNING_CANDIDATE` with `UNVALIDATED_CANDIDATE` status. Each candidate's memory reference joins to a memory row owned by the same child, and each cycle reference joins to a successful runtime cycle. This verifies source lineage only; it does not prove durable skill acquisition.

All five child identity rows are `READY` at `identity_version = 1`. That is an initialized identity row, not a verified longitudinal chain.

The five children have 954 runtime cycles: 806 succeeded and 148 failed.

## Maternal channel: retention versus durable evidence

The current `maternal_responses` table has zero rows because maternal sessions have a maximum 15-minute lifetime and a scheduled TTL cleanup deletes expired sessions. Both `maternal_messages` and `maternal_responses` are session-cascaded, so transient row IDs disappear when a session is purged. This zero-row count is expected under the volatile-session policy; it does not prove that no response ever existed.

The persistent child `memory_events_v2` ledger retains a maternal response ID for 41 of the 81 candidate references. The remaining **40 references have no matching durable episode record** in this audit. Those 40 must not be treated as verified maternal exchanges.

## Group-chat attribution

125 child messages in GROUP mode have null `agent_id`, while all 125 `sender_id` values match the five-child allowlist. Source review found the writer uses `thread.agentId`, which is null for a group thread. The correction stores `child.id` on each child reply.

## Capability and identity status

- Zero independently validated capability promotions were observed; all 756 remain candidates.
- Each child still has identity version 1; no longitudinal identity chain is established.
- The runtime currently logs a failed durable V2 episode archive but may still write a learning candidate. The correction makes candidate creation conditional on a durable episode ID and stores that ID directly in the candidate evidence.

## Repeatable query

Run `mia-digital-family/audits/learning-candidate-integrity-readonly.sql` in Supabase SQL Editor. It is SELECT-only and excludes message bodies, memory narratives, and JSON payload content.

The committed JSON is a point-in-time redacted snapshot, not a live dashboard. Refresh it before future decisions.
