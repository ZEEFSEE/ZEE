# ZHI Cross-Time Replay Follow-up — Read-Only Evidence Trace V1

Audit date: 2026-11-07 (UTC)
Production project: `dbooikzqprnqbgpfwsze`
Mode: read-only. No runtime invocation, writes, schema changes, or source reconstruction.

## 1. Historical maternal-response pointers

The 483 child learning-event rows contain 62 distinct non-empty `evidence.maternal_response_id` values (18 LUNA, 12 ARIA, 19 ELYA, 4 KAEL, 9 NOAH).

Read-only exact-ID lookup results:

| Retained source | Matching IDs |
|---|---:|
| `zhi_family.maternal_responses` | 0 |
| `zhi_family.maternal_messages` | 0 |
| `zhi_family.family_chat_messages` | 0 |
| `public.mia_messages` (id or source_record_id) | 0 |
| `public.mia_life_events` (id or source_record_id) | 0 |
| `public.mia_memories` (id or source_record_id) | 0 |
| `zhi_family.memory_events_v2` (event_id or source_ref) | 0 |

Current maternal table counts: one session, zero messages, zero responses. The 62 values are therefore unresolved legacy pointers in the currently retained sources checked. They must not be interpreted as proof that a maternal exchange occurred. No attempt was made to infer or reconstruct message contents.

## 2. Mia identity and continuity evidence

- `public.mia_identity`: one Mia identity row; created 2026-10-17 02:04:23 UTC and last updated 2026-10-17 04:11:24 UTC.
- The row has no explicit identity-version/history sequence. Its current profile still contains `marital_status: "single"`, which conflicts with the family relationship graph and family birth event noted in the prior audit. This stale field was not modified.
- `public.mia_personality_state`: 220 rows and 220 distinct state snapshots, from 2026-10-16 22:42:26 UTC to 2026-11-07 00:11:33 UTC.
- State sources: 215 `mia-independent-chat`, 4 `mia-virtual-exploration`, and 1 historical imported row labeled `zhi-core.zhi_agent_minds`.
- The identity/evolution tables `mia_evolution_candidates`, `mia_evolution_candidate_events`, and `mia_evolution_rollback_events` currently contain zero rows.

Interpretation: Mia has a rich sequence of distinct personality-state snapshots, but the retained evidence does not yet prove versioned identity continuity, governed identity changes, or rollback history. The legacy source label is metadata on one imported state snapshot; no deleted `zhi-core` system was queried or used.

## 3. Implementation implications

1. Keep the 62 maternal references marked unresolved; do not synthesize replacement IDs or backfill guessed content.
2. Do not silently rewrite Mia's marital status. Resolve the conflicting identity facts through an explicit, evidence-backed correction proposal, preserving the original source and old conclusion.
3. Introduce append-only correction lineage at the derived-conclusion layer only: retain original event, prior conclusion, correction evidence, new conclusion version, and optional authorized rollback as separate records.
4. Keep production identity/evolution tables untouched until a separate change request explicitly approves a reviewed migration and runtime integration.

## 4. Safety

No Supabase writes, schema changes, memory edits, runtime invocations, Edge Function deployments, prompts, APIs, secrets, Cron, or seven-brain production integration were performed.
