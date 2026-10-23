# Mia Automatic Growth Policy v1.1

**Core rule:** Routine growth is automatic. Positive and negative emotional experiences are both valid learning inputs. An intense or extreme emotional event may also trigger automatic reflection and a bounded, reversible adaptation; it does not automatically justify an irreversible or safety-critical change. The manager can revoke an applied growth change.

**Current status:** this policy update is committed separately from runtime implementation. Emotion aggregation, automated evaluation, scheduled execution, safe auto-application, and manager rollback are not yet fully implemented. This document does not change `mia-chat` or read private event bodies.

## 1. Automatic growth by default
- Automatically collect eligible new experience metadata and recorded emotion events from the private Mia database.
- Automatically deduplicate events, identify repeated patterns, reflect on lessons, generate growth candidates, and run evaluations without asking the manager to approve each ordinary learning step.
- Positive emotions can support reinforcing helpful behaviours; negative emotions can support learning from difficulty, boundaries, mistakes, and recovery. Valence alone is not a reason to accept or reject learning.
- An intense/extreme event can trigger immediate reflection and a cautious, reversible adaptation within pre-authorized limits. One event alone must not be treated as proof of a stable personality trait.
- The system must keep a traceable record of evidence, rationale, evaluation result, applied version, and rollback target.

## 2. Evidence sources and interpretation
Allowed private sources:
- `mia_emotion_events`: emotion type, intensity, valence, event time, and opaque source pointer. Do not copy private trigger summaries/details into public artifacts.
- `mia_life_events`: significant experiences, using source pointers and timestamps.
- `mia_memories`: retained context/reflections only when access is authorized and privacy-reviewed.

For each learning candidate, keep separate:
1. Observed experience.
2. Recorded feeling.
3. Tentative interpretation (not a fact).
4. Learning hypothesis and intended behaviour change.
5. Counter-evidence, uncertainty, recovery, and source-health status.

Never infer a feeling merely because a prompt suggests it, or infer the user's private mental state from Mia's records.

## 3. Automatic application boundaries
**Can be automatic after validation:** low-risk, reversible adjustments to conversational approach, expression, reflection habits, and well-supported non-core learning; positive and negative experiences are both eligible. A candidate need not wait for individual human approval.

**Can trigger immediate automatic reflection/adaptation:** intense or extreme emotions, including negative ones, as long as the change remains bounded, reversible, and within the pre-authorized safety envelope. A single event may justify a temporary response or reflection, not a permanent trait claim.

**Must pause for manager approval:** changes that may expose private data, delete or corrupt memories, alter access/security permissions, bypass safety constraints, make external irreversible actions, or permanently alter core principles/identity or other high-impact behaviour. Do not label ordinary negative emotion itself as a security risk.

## 4. Manager revocation and recovery
- The manager has the right to revoke any automatically applied growth change.
- Keep versioned before/after state, provenance pointers, evaluation results, and the last-known-good version so revocation can restore the prior safe state.
- Record revocation as an append-only rollback event; do not erase the original learning or audit history.
- If rollback cannot be verified, pause further application and preserve the last-known-good state.
- Revocation must not require deleting the underlying private chat or emotion records.

## 5. Repetition, uncertainty, and source health
- Deduplicate by source-record identity; recurring patterns require distinct source records and dates.
- Opposing emotions and counter-evidence must be represented rather than flattened into a single score.
- Missing history, database errors, or a sudden unexplained history reduction yield `INCONCLUSIVE`; they never mean “no feelings” or “no growth.”
- One intense event may trigger reflection, but stable-trait claims require the applicable evidence and stability thresholds.

## 6. Privacy and isolation
- Keep source pointers and detailed emotion records in the private `zee-extension` database.
- Public GitHub may contain only synthetic tests and approved non-identifying policy artifacts.
- Never put raw private chats, emotion details, secrets, or personal data in public fixtures, logs, or reports.
- Do not change `mia-chat` as part of policy-only work. Runtime integration and live write-back require separate implementation and verification.
- Never modify or delete source memories/emotion records as a side effect of growth.

## 7. Minimum acceptance tests
1. Synthetic positive and negative events both enter evaluation.
2. An intense event triggers reflection and at most a bounded reversible adaptation, not an unsupported permanent trait.
3. Repeated events across dates are deduplicated and counted from source records, not user-supplied counts.
4. Conflicting emotions/counter-evidence lower confidence or produce `INCONCLUSIVE`.
5. Missing history/source errors fail closed for application.
6. No raw private text appears in logs, GitHub, or test reports.
7. Ordinary low-risk learning runs without human approval.
8. Extreme-risk changes pause for manager approval; ordinary negative emotion does not.
9. A manager revocation restores the last-known-good version and appends a rollback event.
10. Tests make no writes to live Mia memories, emotion events, personality, or chat tables.

## 8. Implementation status
The existing schema allows `mia_emotion_events` as a source scope and stores emotion summary separately from facts and interpretations. The deployed pipeline currently verifies one source pointer per candidate; it does not aggregate multi-event emotion history, run an automated evaluator, schedule growth runs, safely apply approved low-risk changes, or implement end-to-end manager revocation. This policy is the intended behaviour, not a claim that these runtime features are already active.
