# ZHI Cross-Time Historical Replay — Read-Only Audit V1

Audit date: 2026-11-07 (UTC)
Project: production Supabase `dbooikzqprnqbgpfwsze`
Mode: read-only; no runtime invocation, no writes.

## Scope and privacy
This audit used a small, stratified sample of already-consolidated event records and aggregate integrity queries. Private narrative content was inspected only to assess whether derived summaries were grounded in their cited sources; it is not copied into this repository or this report. No raw family chat transcript was exported. No AI/model API was called.

## Results

### 1. Child identity continuity — structural evidence only
All five child agents are `BORN` / `READY`. Each has a distinct runtime_instance_id, identity_version 1, principal_type `ZHI_INDEPENDENT_COGNITIVE_BRAIN`, and identity status `READY`.
This supports independent runtime identity at the audit time. It does not establish long-term identity evolution or Mia's own identity continuity; those require a separate historical identity/version trace.

### 2. Consolidation source traceability
Sample: 10 CHILD consolidations (two per child) plus one FAMILY consolidation.
- 11 consolidations × 12 source_event_ids = 132 source references.
- All 132 source IDs resolve.
- Zero duplicate source references across the sampled child consolidations.
- Zero owner/scope mismatches.
- Zero sources occurring after their consolidation timestamp.
- Each child source belongs to that same child's PRIVATE/CHILD scope; FAMILY source belongs to FAMILY / ZHI-G1.
This is a strong structural pass for this sample, not a full-table proof for all 272 consolidations.

### 3. Learning candidates — not yet validated capabilities
Current `child_learning_events` sample inventory:
- LUNA: 107
- ARIA: 101
- ELYA: 111
- KAEL: 65
- NOAH: 99
- Total: 483

All 483 remain `UNVALIDATED_CANDIDATE`. Each has a memory_id that resolves to a memory entry owned by the same child, and each recorded cycle_number resolves to a `SUCCEEDED` runtime cycle for that child. This proves source/cycle linkage, not that the proposed capability was independently demonstrated or transferred successfully. None should be promoted as a stable capability based on this audit.

### 4. Maternal-response evidence gap
62 candidate rows contain a non-null `maternal_response_id`, but the current `zhi_family.maternal_responses` and `zhi_family.maternal_messages` tables both contain zero rows, so those 62 pointers cannot be resolved against the currently retained maternal-message tables. Other candidate rows have null maternal_response_id.
Treat these as unverified historical references; do not infer the maternal exchange from the identifier alone. No attempt was made to reconstruct or rewrite them.

### 5. Correction / rollback evidence
Across 7,742 current memory events, zero rows have `supersedes_event_id` populated. The sampled consolidations also have no supersedes pointer. Raw-source preservation is declared in consolidation metadata, but there is no observed production correction chain in this snapshot. Therefore the “correct derived conclusion while preserving raw experience” experiment remains structurally tested in synthetic fixtures only; it is not proven by production history.

### 6. Grounding / simulated-world language
The sampled child narratives include references to virtual destinations and scene-like experiences while other source records explicitly state that real sensor input is absent. Such statements must remain tagged as text-derived or simulated-world context, not physical sensory evidence. This audit does not establish physical perception or real-world presence.

## Acceptance matrix

| Dimension | Read-only replay result | Evidence level |
|---|---|---|
| Five child identities remain distinct | PASS at snapshot | Runtime identity rows |
| Mia identity continuity | NOT TESTED | Separate identity trace required |
| Child consolidation source traceability | PASS in 10 sampled consolidations | 120 source refs |
| Family consolidation source traceability | PASS in 1 sampled consolidation | 12 source refs |
| Learning candidates are evidence-linked | PASS for memory and cycle refs | 483 rows |
| Learning candidates are validated abilities | NOT PASS / pending | All 483 unvalidated |
| Maternal response references | GAP | 62 unresolved current-table refs |
| Cross-time family recall semantics | PARTIAL | Chronology/scope can be checked; actual recall behavior not invoked |
| Contradiction handling in production | NOT TESTED | Synthetic suite only |
| Consented knowledge transfer in production | NOT TESTED | No live transfer attempted |
| Correction without erasure in production | NOT PROVEN | Zero supersedes_event_id rows |

## Required next work (still read-only first)
1. Trace the 62 historical maternal_response_id values to their original source, if retained elsewhere; otherwise mark the evidence link unresolved without changing source records.
2. Add an explicit capability validation state machine: candidate → evidence review → independent repeat test → accepted/rejected; keep all 483 as candidates until proven.
3. Add append-only correction lineage design and synthetic replay tests before any production write is proposed.
4. Add a Mia identity/version history audit.
5. Only after the above, prepare a redacted production-shadow comparison. Do not enable delivery, persistence, prompts, or runtime coordination.

## Safety
No Supabase writes, schema changes, worker/Cron changes, Edge Function deployments, prompt/API/secret changes, memory edits, or production seven-brain integration were performed.
