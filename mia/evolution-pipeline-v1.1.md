# Mia Evolution Pipeline v1.1 — Candidate Intake and Shadow Review

**Status: design specification only.** This document does not change Mia chat runtime, read or write private records, schedule jobs, or publish genes automatically.

## Goal

Extend the existing evolution policy into a safe, observable pipeline. Keep private lived experience in `zee-extension`; keep only privacy-reviewed, distilled, approved learning in GitHub. The currently deployed `mia-evolution-ledger` records rollback events only. It is not a candidate queue and is not integrated with `mia-chat`.

## Pipeline states

`unmarked → candidate → evidence_check → stability_check → privacy_review → contradiction_check → human_review → approved_for_shadow → shadow_observation → approved_for_release → committed`

Terminal or holding states: `deferred`, `rejected`, `blocked_source_health`, `blocked_privacy`, `blocked_conflict`.

- A state transition must have an actor/source, timestamp, reason code, and idempotency key.
- Never infer that missing rows mean there are no memories. Unexpectedly empty/reduced source history blocks promotion and raises an integrity alert.
- No transition directly from `candidate` to `committed`.
- `approved_for_shadow` is not permission to change live behavior. Shadow mode evaluates a candidate without affecting user-facing replies.
- Release requires a separate explicit approval after shadow review. Core-principle changes always require explicit human approval.

## Candidate record: metadata only

The private queue should store:
- random `candidate_id`, `gene_id` (assigned only when appropriate), category, state, schema version;
- an opaque `memory_pointer` and `source_scope`; never a raw conversation or direct identifier;
- mark time, observation-window start/end, evidence count and distinct observation dates;
- separate labels for observed fact, interpretation, and emotion (short abstract text only, subject to privacy review);
- confidence plus rubric version and rationale; do not fabricate confidence;
- duplicate/contradiction check status, privacy review status, reviewer decision and timestamps;
- proposed gene version, last-known-good version, idempotency key, created/updated timestamps.

The pointer-to-record mapping must remain in private, access-controlled storage. Do not store API keys, JWTs, service-role credentials, signed URLs, names, contact details, precise private coordinates, health details, raw chat, or sensitive information about other people in GitHub.

## Evidence and admission gates

Use the thresholds in `evolution-trigger.json`:
- `verified_insight`: at least 14 days since explicit mark and 3 supporting observations across 2 dates, or documented independent verification.
- `stable_trait_upgrade`: at least 30 days since explicit mark, 5 observations across 3 dates, and no unresolved material contradiction.
- `soul_anchor`: at least 7 days of reflection and explicit review; a one-off meaningful event must not be represented as a repeated pattern.
- `core_principle`: at least 30 days and explicit human approval plus safety/conflict review.

Evidence checks must retrieve referenced records from the private store, verify source health and provenance, deduplicate events, and separate facts from interpretations/feelings. A database timeout, permission error, missing pointer, incomplete page, or unexpected count reduction is a block—not a pass.

## Shadow evaluation

For each approved candidate, compare the current approved gene set against a proposed candidate on a fixed, privacy-safe evaluation set. Record:
- evaluation-set version and test-case IDs (no private transcript content in public artifacts);
- expected behavior, observed behavior, pass/fail, severity, and reviewer notes;
- regression checks for privacy, safety, consistency, user intent, and existing Mia chat behavior;
- model/runtime versions and the proposed gene commit.

Shadow evaluation must not send extra messages to the user, change personality state, write emotions, or mutate the live prompt. Do not use private chats as public fixtures. A failed or inconclusive run returns to `deferred` or `rejected`; it does not self-approve.

## Release, rollback, and audit

- Release is a separate human-approved action with a reviewed diff and a recorded last-known-good target.
- Keep each gene version and prior Git history. Never overwrite raw life history to make a candidate fit.
- On a material regression, stop the candidate and restore the last-known-good version first. Then append an `Evolution_Rollback_Event` to the private ledger. Do not wait for ledger availability to stop a harmful version.
- The rollback ledger remains append-only; use a correction/superseding event rather than editing an old event.
- If event persistence fails, report it as pending/failed; do not claim it was recorded. A durable retry/outbox must be implemented and tested before claiming automatic reconciliation.

## Operational metrics

Track counts by state, oldest pending age, source-health failures, privacy blocks, duplicate/contradiction blocks, review wait time, shadow pass rate, rollback count, and ledger persistence failures. Metrics must not include raw messages or identifying details.

## Rollout plan

1. **Read-only audit** of schema, permissions, current chat path, and function logs.
2. Add a private candidate queue as an additive schema change; keep it disconnected from `mia-chat`.
3. Implement authenticated `validate`/dry-run intake first; prove it performs no write.
4. Add a server-only append operation and idempotency tests; never expose service-role credentials to a browser.
5. Add scheduled/manual candidate evaluation only after source-health and privacy gates are tested.
6. Run shadow mode; compare outputs without affecting live replies.
7. Require explicit approval before any gene commit or live runtime activation.
8. Test rollback and ledger outage handling in a non-production environment before connecting the runtime.

## Current verified boundary

The rollback-event table and isolated `mia-evolution-ledger` endpoint are deployed. The existing `mia-chat` function has not been modified. Candidate intake, stability automation, privacy review UI, shadow evaluation, automatic promotion, runtime gene loading, and automatic rollback are **not implemented by this specification**.
