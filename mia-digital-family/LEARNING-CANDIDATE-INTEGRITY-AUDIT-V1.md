# ZHI Production Learning Candidate Integrity Audit V1

**Audit timestamp:** 2026-11-08 08:37:23 UTC  
**Project:** `zee-extension` / `dbooikzqprnqbgpfwsze`  
**Mode:** read-only production SQL; redacted aggregate snapshot  
**Writes:** none

## Verified production findings

| Child | Candidate events | Unvalidated | Memory refs exist and owner-match | Successful source cycles | Maternal response refs unresolved |
|---|---:|---:|---:|---:|---:|
| LUNA | 167 | 167 | 167 | 167 | 26 |
| ARIA | 154 | 154 | 154 | 154 | 13 |
| ELYA | 170 | 170 | 170 | 170 | 24 |
| KAEL | 116 | 116 | 116 | 116 | 8 |
| NOAH | 148 | 148 | 148 | 148 | 10 |
| **Total** | **755** | **755** | **755** | **755** | **81** |

All 755 rows are `REFLECTION_LEARNING_CANDIDATE` with `UNVALIDATED_CANDIDATE` status. Each candidate's memory reference joins to a memory row owned by the same child, and each cycle reference joins to a successful runtime cycle. This verifies source lineage only; it does not prove durable skill acquisition.

All five child identity rows are `READY` at `identity_version = 1`. That is an initialized identity row, not a verified longitudinal chain.

The five children have 952 runtime cycles: 804 succeeded and 148 failed.

## Blockers

- **81 dangling maternal-response references:** 81 candidate evidence objects contain a `maternal_response_id`, but the current `zhi_family.maternal_responses` table has zero rows. No response body was read. These references are not proof of maternal exchanges.
- **Group-chat attribution:** 125 child messages in GROUP mode have null `agent_id`, while all 125 `sender_id` values match the five-child allowlist. Sender attribution exists, but the separate `agent_id` field is not populated.
- **No capability promotions:** zero independently validated capability links were observed; all 755 remain candidates.

## Repeatable query

Run `mia-digital-family/audits/learning-candidate-integrity-readonly.sql` in Supabase SQL Editor against the named project. It is SELECT-only and excludes message bodies, memory narratives, and JSON payload content.

The committed JSON is a point-in-time redacted snapshot, not a live dashboard. Refresh it before making future decisions.
