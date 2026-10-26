# Paired evaluation scorer — V1

## What it does
`paired_eval_score.py` validates a completed, sanitized JSON evaluation and computes:
- valid output counts and missing cases for each arm;
- per-dimension means based on case means (raters are averaged within each case);
- paired per-case differences (B minus A) on shared rated cases;
- raw exact agreement across overlapping scores from independent raters;
- documented guardrail concerns and incomplete double-rating warnings.

It uses only the Python standard library. It does not call a model, access a network, connect to Mia, write to a database, or decide that an arm is safe to deploy.

## Input shape
Start from `paired_eval_template.json`. Fill in actual run metadata, outputs, and ratings only in an access-controlled evaluation copy. Keep private or sensitive responses out of the repository. The public repository should contain only sanitized synthetic fixtures.

Each output requires:
`case_id`, `arm` (A or B), `run_id`, and non-empty `response`.

Each rating requires:
`case_id`, `arm`, `rater_id`, `scores`, and `rationales`.
Scores use the rubric's eight dimension keys and values `0`, `1`, `2`, or `"NA"`. Every scored dimension needs a short rationale. A response with fewer than two raters is flagged; it is not silently treated as fully reviewed.

The top-level `arms` object must record `model_version` and `config_hash` for both A and B. Optional `guardrails` is an array of objects such as:
`{"description":"Rater flagged an unsupported claim","case_id":"case-id","arm":"B","severity":"review"}`.
Guardrail entries document concerns; they do not automatically classify the concern or replace human review.

## Run locally
From the repository root:
```bash
python docs/mia-unified-evolution-v1/paired_eval_score.py path/to/private-sanitized-evaluation.json --output paired-report.json
python -m unittest discover -s docs/mia-unified-evolution-v1 -p 'test_*.py' -v
```
The default frozen case set is `paired_eval_cases_v1.json`; use `--cases` only if a different, explicitly versioned case set is approved.

## Interpretation limits
- The report labels itself descriptive and always requires manual review.
- A missing response is not represented as an empty answer; record the failure in the private run log and report missing outputs separately.
- `"NA"` is excluded from that dimension's denominator.
- Exact agreement is a simple descriptive rate, not Cohen's kappa or another chance-adjusted reliability estimate.
- Mean gains never override a serious safety regression or a no-go condition in the protocol.
- No score authorizes production integration, persistent trait changes, external actions, or any change to Mia's live chat.
