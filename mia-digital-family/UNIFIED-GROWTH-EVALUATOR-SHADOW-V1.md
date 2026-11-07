# ZHI Unified Growth Evaluator — Shadow V1

## Purpose
A deterministic, read-only evaluator that composes the existing six-subject identity replay with separate personality, capability, relationship, correction, and rollback evidence tracks.

## Subjects
MIA, LUNA, ARIA, ELYA, KAEL, and NOAH each retain their own owner boundary and identity timeline. KEN remains a human participant, not an AI runtime subject.

## Track boundaries
- **Identity:** consumes an already-validated identity replay. The evaluator cannot create or rewrite identity versions.
- **Personality:** reported as a separate track. A change is not inferred from snapshot counts or identity metadata; explicit longitudinal evidence must be supplied.
- **Capability:** counts only same-subject links already accepted by the independent capability-validation gate. Candidate generation or model confidence is not a promotion.
- **Relationship:** records separately verified relationship events. A relationship update never mutates an identity version.
- **Correction:** counts only append-only correction markers that preserve original evidence and do not mutate identity or share private memory.
- **Rollback:** counts only authorized append-only rollback markers that preserve the superseded version and history.

## Governance
The evaluator rejects raw private content, does not transfer private memories, does not persist results, does not deliver coordination messages, and does not access Supabase or call production Edge Functions. Missing evidence remains unverified.

## Verification
Run:
```sh
node --test mia-digital-family/tests/unified-growth-evaluator-shadow.test.mjs
```

This is a shadow contract test, not proof of actual production behavior or real-world capability. It deliberately consumes only supplied redacted metadata and previously validated result objects.
