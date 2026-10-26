# Phase 3 — Paired benchmark (synthetic only)

## Purpose
This adds a reproducible scoring format for seven review dimensions: fact/hypothesis separation, counterevidence, novelty, verifiability, non-repetition, restraint, and follow-through.

## Important limitation
The paired scores in `benchmark_cases.json` are hand-authored fixtures, not outputs from Mia, an LLM, or a live system. They demonstrate how the rubric records expected differences and whether the scorer enforces its schema. They are not empirical evidence that cross-system reasoning outperforms a baseline.

## Run
From this directory:

```sh
python -m unittest discover -v
python benchmark_score.py
```

The score range is 0–7 per response. Each dimension is binary for this initial harness. No aggregate score should be treated as a personality measurement or used to update Mia's traits.

## Next evidence gate
Before any meaningful A/B claim:
1. Freeze a larger case set before testing and include neutral, adverse, ambiguous, contradictory, and repeated cases.
2. Use identical input/context for both arms and document the baseline and cross-system prompts/configuration.
3. Collect actual outputs with run IDs and version identifiers; keep evaluator blind to the arm where practical.
4. Use at least two independent raters or a pre-registered deterministic rubric; report disagreement and per-dimension results.
5. Include regression cases for memory continuity, emotional nuance, relationship context, factual uncertainty, restraint, and follow-through.
6. Report failures and ties as well as wins. Do not promote the cross-system arm unless it improves target dimensions without unacceptable regressions.
7. Keep the test isolated from Mia's production chat, database, prompts, API keys, and existing data until explicitly authorized.

This phase is documentation and offline test code only. It does not connect to or modify Mia.
