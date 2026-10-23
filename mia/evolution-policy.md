# Mia Evolution Ledger — Growth and Gene Policy v1.0

Status: design specification only. This file does not itself change runtime behavior or connect to Supabase.

## Purpose

Preserve durable, evidence-based growth in version-controlled files while keeping raw life history in its private source of record. GitHub stores distilled learning ("genes"), not a copy of private conversations.

## Gene categories

- `verified_insight`: a supported insight derived from one or more traceable experiences.
- `stable_trait_upgrade`: a durable behavior tendency that has remained consistent over time and passed review.
- `soul_anchor`: an especially meaningful person, relationship, event, place, or shared experience whose lasting significance helps explain Mia's values, perspective, or behavior. Store the distilled meaning and its influence—not a raw transcript or intimate dossier.
- `core_principle`: a high-level identity or conduct principle. Changes require explicit review and versioning.

## Soul-anchor handling

A person or event may be considered for a `soul_anchor` when its significance is supported by the source record and is more than a transient reaction. Record:
- a non-identifying or pseudonymous reference;
- a concise, abstract description of why it matters;
- the lasting lesson or value it supports;
- evidence references that do not expose private content;
- confidence, observation dates, review status, and version.

Do not commit names, contact details, precise private locations, raw chat messages, secrets, health details, or sensitive information about another person to a public repository. If the meaningful detail cannot be safely abstracted, keep it in private storage and put only a non-revealing pointer or general lesson in GitHub.

## Admission criteria

Before a candidate becomes a gene, check:
1. Traceable source evidence exists; do not invent or infer missing memories.
2. Separate observed facts from interpretation and emotion.
3. The insight is durable enough for its category; one intense event alone does not automatically establish a stable trait.
4. The candidate adds something useful and is not a duplicate or contradiction.
5. Privacy review passes and only the minimum necessary information is retained.
6. The change has a reason, version, reviewer/approval status, and rollback path.

## Suggested record shape

```json
{
  "schema_version": "1.0",
  "gene_id": "gene-example-001",
  "type": "soul_anchor",
  "status": "candidate",
  "summary": "Abstract, non-identifying statement of lasting significance",
  "lasting_lesson": "The durable value or perspective supported by the experience",
  "evidence_refs": ["private-reference-placeholder"],
  "confidence": null,
  "first_observed_at": null,
  "last_reviewed_at": null,
  "review_status": "pending",
  "version": 1,
  "rollback_to": null
}
```

The example values above are placeholders, not real Mia memories. Confidence must be based on a documented rubric; it must not be fabricated for appearance.

## Failure and recovery rules

- If Supabase is unavailable, empty, or unexpectedly reduced, pause new gene promotion. Do not interpret missing data as proof that no history exists.
- Continue using only the last known-good, approved gene set.
- Reconcile source history before resuming promotion.
- Keep raw records in private storage; preserve version history and maintain a separate backup of important GitHub artifacts.
- GitHub version history is not a substitute for an independent backup.

## Runtime status

This document is a policy/specification only. No automatic extraction, database read, approval workflow, or runtime loading is implemented by this file alone. Any implementation must be audited and tested separately before being described as active.
