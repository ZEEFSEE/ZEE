# Mia Evolution Trigger and Recovery Specification v1.0

Status: specification only; runtime integration is not implemented by this document.

## 1. Core rule

No Supabase record is copied into GitHub merely because it exists. A candidate must be explicitly marked, pass category-specific stability checks, pass privacy and conflict checks, and be approved before a distilled gene is committed.

## 2. Trigger states

`unmarked` -> `candidate` -> `stability_check` -> `privacy_review` -> `approved` -> `committed`

Any failed check moves the candidate to `deferred` or `rejected`. Missing source data or an unhealthy database pauses the pipeline; it must never be treated as an empty history.

## 3. Candidate marks and default stability thresholds

These are conservative starting thresholds, not claims about existing behavior. A human reviewer may extend the period; thresholds must not be shortened automatically.

| Type | Required explicit mark | Minimum stability window | Minimum evidence |
|---|---|---:|---|
| `verified_insight` | `verified_insight` | 14 days | 3 supporting observations across at least 2 dates, or documented independent verification |
| `stable_trait_upgrade` | `stable_trait_upgrade` | 30 days | 5 supporting observations across at least 3 dates; no unresolved material contradiction |
| `soul_anchor` | `soul_anchor` | 7-day reflection period | Explicitly marked as deeply meaningful and reviewed; a singular event may qualify as an anchor, but must not be misrepresented as a repeated pattern |
| `core_principle` | `core_principle` | 30 days | Explicit human approval and conflict/safety review |

The stability window starts when the candidate is marked, not when a backfilled record was first created. Historical evidence may support the candidate, but may not bypass the review window. The system must distinguish a stable trait from a meaningful one-time event.

## 4. Commit gate

Before commit, require all of:
- source records are retrievable and source health checks pass;
- candidate mark, timestamps, evidence count and stability window are valid;
- facts, interpretation and feelings are separately labeled;
- duplicate and contradiction checks pass;
- privacy minimization passes;
- reviewer approval is recorded for the applicable category;
- proposed diff and rollback target are available.

Only the distilled learning goes into GitHub. Raw conversations, full emotional-event payloads, names, contact details, precise private coordinates, secrets, health details and sensitive information about other people must not be copied into a public repository.

## 5. Memory pointer and recovery

Each approved gene should include a non-secret, opaque `memory_pointer` (random stable reference) and a `source_scope` such as a private table/record namespace. The pointer is not a credential and must not contain an access token, database URL with secrets, or raw personal data.

For a public repository, use only opaque pointers and safe source metadata. Keep the mapping from pointer to private record identifiers inside the private data store or another access-controlled location. Never commit Supabase keys, passwords, JWTs, service-role tokens, or direct signed URLs.

When Supabase recovers:
1. verify database identity and health;
2. resolve the opaque pointers using authenticated server-side code;
3. retrieve only the referenced records;
4. verify integrity and timestamps, deduplicate, and compare against the last-known-good snapshot;
5. restore missing history to the private store or rebuild summaries only after validation;
6. record a recovery report without publishing private content.

If Supabase is unavailable, do not attempt repeated writes, create replacement memories from absence, or overwrite the last-known-good gene set. Continue using approved genes already present in GitHub and mark the live-history status as degraded.

## 6. Rollback and integrity

- Every gene has a stable `gene_id`, version, `rollback_to`, source pointer(s), review status and change rationale.
- A new commit never deletes previous Git history intentionally.
- Keep an independent backup; GitHub history alone is not a complete disaster-recovery plan.
- After recovery, do not merge recovered records blindly: reconcile duplicates, timestamps, provenance and conflicts first.

## 7. Rollback continuity event

A rollback is incomplete from an audit perspective unless the failed experiment remains visible in the private history. When a newly promoted gene conflicts with observed behavior:

1. Switch the active gene/runtime back to the recorded last-known-good target. Do not wait for Supabase logging to succeed before stopping a harmful or conflicting version.
2. Create an append-only private Supabase event of type `Evolution_Rollback_Event`.
3. Store at minimum:
   - `event_id`, `event_type`, `gene_id`;
   - `attempted_version` and `attempted_commit`;
   - `rollback_to_version` and `rollback_to_commit`;
   - `detected_at`, `conflict_category`, `scenario_summary`, `expected_vs_observed`;
   - `evidence_pointers`, `decision`, `result`, `idempotency_key`, `created_at`.
4. Use opaque pointers to detailed evidence; keep raw dialogue and the pointer-to-record mapping in private, access-controlled storage. Do not write private details into GitHub.
5. Preserve the event as immutable history. Later clarification creates a linked correction/superseding event; it must not erase the original attempted version or rollback.
6. Treat the event as a learning candidate about context-specific boundaries. It must not automatically create or promote a gene; any public distilled lesson goes through the normal explicit-mark, privacy, stability and approval gates.

If Supabase is unavailable, perform the rollback first and raise an operational alert. Persist a retry/outbox entry where the runtime has a durable mechanism; otherwise clearly surface that the event is pending and reconcile it after recovery. A rollback event is only `persisted` after confirmed database success. Use an idempotency key to avoid duplicate writes on retry.

Suggested lifecycle:
`detected -> runtime_reverted -> event_pending -> event_persisted -> reviewed`
The event may remain `event_pending` during a database outage. Never falsely label it persisted.

This record supports identity continuity in the engineering sense: future versions can inspect which change was attempted, in what context it conflicted, and which known-good version was restored. It does not imply human-like subjective awareness.

## 8. Example pointer-bearing gene (illustrative only)

```json
{
  "schema_version": "1.0",
  "gene_id": "gene-example-001",
  "type": "verified_insight",
  "status": "candidate",
  "summary": "Abstract, non-identifying distilled lesson",
  "memory_pointer": "opaque-ref-placeholder",
  "source_scope": "private-memory-record",
  "evidence_count": 3,
  "marked_at": null,
  "stability_window_days": 14,
  "review_status": "pending",
  "version": 1,
  "rollback_to": null
}
```

All identifiers and content in the example are placeholders, not real Mia memories.

## 9. Current implementation boundary

This file defines intended policy only. It does not currently query Supabase, enforce timers, resolve pointers, approve candidates, or commit genes automatically. Those behaviors require separate code changes, tests, and explicit verification. Until then, do not describe the trigger or recovery as active.
