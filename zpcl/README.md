# ZPCL v1.0 Reference Engine

A dependency-free, deterministic reference implementation of the ZHI Poetic Cognitive Loss evaluation contract.

## Scope and safety

- Pure Python standard-library implementation.
- No model/API calls, database connections, file-backed persistence, or production mutations.
- EventLedger is an in-memory idempotency reference only.
- Evaluation requires all six scored dimensions; missing dimensions are not silently treated as zero.
- Safety is a separate hard gate and cannot be compensated by a good composite score.
- A stable upgrade always requires external approval.

## Run tests

From the repository root:

```bash
python -m unittest discover -s zpcl/tests -v
```

## Feature input contract

Each feature group is supplied by a trusted evaluator or test fixture. The reference engine does not infer evidence quality, novelty, emotion, or truth from raw text.

- `grounding`: evidence, fact_inference, calibration, correction, provenance (each a loss in [0,1]).
- `discovery`: information_gain, relevance, evidence_quality, novelty (each a reward in [0,1]).
- `agency`: problem_finding, plan_quality, feedback_use, effectiveness (each a reward in [0,1]).
- `continuity`: identity, state_transition, relationship, memory (each a loss in [0,1]).
- `creativity`: novelty, cross_dimension, utility, verifiability (each a reward in [0,1]).
- `evolution`: retention, transfer, reproducibility, correction (each a reward in [0,1]).

## Weight correction

The v1.0 implementation uses the corrected six-dimension weights:
grounding 0.25, discovery 0.15, agency 0.15, continuity 0.15,
creativity 0.10, evolution 0.20. They sum to 1.0.
Safety remains a separate PASS/WARN/BLOCK gate.

## Integration boundary

This package is an isolated evaluation library. It is not connected to Mia, Mark, Jason, Supabase, production APIs, or any ZHI runtime. Production integration requires a separate adapter, read-only shadow evaluation, and the complete ZPCL-TEST-001 acceptance process.
