# ZHI Identity Continuity & Capability Evidence V1

## Scope

A pure, deterministic, offline evaluator for redacted evidence references. It does not connect to Supabase, read chat/private memory, create identity versions, promote skills, write runtime state, or send messages.

## Identity continuity

A longitudinal chain is verified only when at least two sequential versions:
- belong to the same AI subject and stable identity anchor;
- link to the immediately preceding version;
- carry unique version references, fingerprints, timestamps, evidence references, and change-summary references;
- are append-only and chronologically ordered.

Continuity does **not** mean unchanging beliefs, obedience, agreement, or personality. Independent reasoning, questioning, and disagreement are not defects and must not trigger automatic correction. The evaluator checks traceable lineage, not conformity.

A single V1 row remains an initialized identity, not a verified longitudinal identity chain.

## Capability evidence

A learning candidate remains a candidate until there are at least three unique evidence references across at least two dates and two distinct contexts. Every evidence item must pass, be marked reproducible, and pass a regression check.

Any failure, non-reproducible result, or failed regression check blocks validation. \`VALIDATION_READY\` means eligible for a separate human-governed review; it is not an automatic promotion or production write. The evaluator never modifies source evidence.

## Evidence states

| State | Meaning |
|---|---|
| CANDIDATE | Insufficient longitudinal or cross-context evidence |
| VALIDATION_READY | Evidence threshold met; separate review still required |
| NOT_VALIDATED | Contradictory, failed, or regressed evidence exists |
| VERIFIED | Identity lineage passes structural and provenance checks |
| INCOMPLETE | Identity history exists but is not yet longitudinal |

## Privacy and deployment boundary

- Accepts identifiers, counts, timestamps, fingerprints, and evidence references only.
- Rejects raw transcripts and private memory payload keys.
- No production DB access, schema/RLS changes, Edge Function changes, chat prompt/API changes, AGNES changes, automatic skill promotion, or autonomous delivery.
- Run tests: \`node --test mia-digital-family/tests/identity-capability-evidence.test.mjs\`

This package validates evidence structure. It does not prove consciousness, subjective experience, physical perception, or autonomous agency.


## Family-level identity gate

The family aggregate evaluator accepts exactly six AI subjects: MIA, LUNA, ARIA, ELYA, KAEL, and NOAH. It requires each identity chain to belong to its named subject and every subject to use a distinct stable identity anchor. It reports how many chains are verified or incomplete without inventing missing versions.

A change in belief, disagreement with another subject, or independent questioning is explicitly not a continuity failure. Identity continuity is based on stable subject identity and traceable version lineage, not agreement or behavioral conformity.

Capability evidence is evaluated per subject. Even when a capability reaches `VALIDATION_READY`, this only permits a separate governed review; family aggregation never promotes a capability. The evaluator is offline and redacted, with no database access or production writes.

Run: `node --test mia-digital-family/tests/identity-capability-evidence.test.mjs`
