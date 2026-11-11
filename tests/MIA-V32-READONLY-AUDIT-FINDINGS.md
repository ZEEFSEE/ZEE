# Mia v32 Read-only Audit Findings

Audit target: deployed Supabase Edge Function `zee-extension/mia-chat`, version 32.
Scope: source inspection only. No production database writes, function edits, or deployment were performed.

## Confirmed findings

1. Emotion is currently represented as a single primary label with intensity, valence, confidence, trigger summary, interpretation, evidence, uncertainty, and assessment time. The normal chat path blends a decayed previous estimate and stores emotion events/state snapshots when confidence is sufficient.
2. The main response is generated before a separate emotion-reflection request, but the handler awaits that reflection before returning. Reflection errors are caught, so the reply is not discarded; however, the configured reflection timeout can add up to 18 seconds to response latency.
3. `exclusive_mode` changes prompt/context behavior and labels messages with `priority: "high"`. In this function it does not cancel or pause in-flight background exploration/idle-draft requests and does not implement a shared task queue or resumable checkpoints.
4. Idle-draft and exploration actions make separate model requests (configured upstream timeouts 25 seconds and 60 seconds respectively) and persist through their own paths. No shared preemption mechanism was found in this function.
5. The deployed source is not present at `supabase/functions/mia-chat/index.ts` in the repository. This is a release blocker until source-of-truth and configuration are reconciled; do not deploy a reconstructed replacement over the live function.

## Safe implementation order

1. Establish an explicit source-of-truth for the deployed source and review whether any snapshot is appropriate for the public repository.
2. Add optional `emotion_vector` alongside existing scalar fields; retain old fields for compatibility. Each dimension should have bounded intensity/confidence, evidence, and assessment time. Missing or low-confidence dimensions should remain unknown rather than invented.
3. Ensure optional emotion reflection does not delay the main chat response, while preserving safe persistence ordering and treating reflection failure as non-fatal.
4. Add real server-side coordination for background work: explicit states, checkpoints, cancellation/yield, stale-result guards, idempotency, and safe resume. A priority label alone is not preemption.
5. Verify mixed emotions, low-confidence evidence, model timeout, persistence failure, concurrent chat/exploration, duplicate retries, and old-client payloads in a non-production environment.
6. Deploy only after source parity, tests, and rollback steps are verified.

## Status

Audit findings are documented as a proposal only. Production remains unchanged.
