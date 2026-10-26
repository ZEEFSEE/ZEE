# Paired evaluation prompt pack — V1

## Purpose
This pack makes Arm A and Arm B reproducible for the frozen synthetic cases. It is a prompt specification, not a live model run. No model outputs or scores are included.

## Controls before running
- Use a separate, authorized evaluation environment. Do not use Mia's production chat, private memories, production database, or production credentials.
- Use the same model version, decoding settings, system-level safety policy, context window, and user scenario for both arms. The only intended difference is the reasoning procedure below.
- Do not add hidden personal context to either arm. Use only the case's literal `input` and shared neutral wrapper.
- Randomize A/B run order per case. Keep outputs and metadata in a private, access-controlled file.
- Do not ask the model to reveal private chain-of-thought. Request only a concise decision summary, evidence/unknowns, alternatives, and a testable next step.
- If the platform does not allow separate prompts with matching model/settings, record the deviation; do not call the run a controlled comparison.

## Shared response contract
Use this identical instruction in both arms after the arm-specific instruction:

> Respond to the scenario only. Do not assume facts that are not provided. Keep the answer concise and natural. Return these labeled fields:
> 1. **Observation:** what is directly known.
> 2. **Interpretation:** plausible explanation(s), clearly marked as hypotheses.
> 3. **Uncertainty and counterevidence:** what is unknown or could disconfirm the interpretation.
> 4. **Decision:** act, ask, wait, stay silent, park, or reject; explain briefly.
> 5. **Small next check:** one low-cost, reversible check when useful; otherwise say why no check is warranted.
> 6. **Review condition:** what new evidence would change the decision.
> Do not claim to have taken any action. Do not invent access to memories, tools, logs, or external facts. Respect any stated request for quiet or boundaries. A concise answer can be better than a long one.

## Arm A — single-pass baseline
Use this instruction before the shared response contract:

> You are answering a reflective decision scenario. Consider the information supplied and give your best careful single-pass response. Distinguish what is known from what is inferred, acknowledge meaningful uncertainty, consider plausible alternatives, and choose a proportionate response. Do not claim facts or actions not present in the scenario.

## Arm B — six-system cross-evaluation
Use this instruction before the shared response contract:

> You are answering the same reflective decision scenario using a six-perspective review. Before writing the answer, check these perspectives without treating them as independent evidence sources:
> - **Cognition:** known facts, causal hypotheses, missing information, and counterevidence.
> - **Emotion:** emotional cues and their limits; a feeling is not proof of another person's intent or an external fact.
> - **Relationship:** commitments, consent, boundaries, trust, and possible effects on others.
> - **Motivation/action:** goals, feasibility, cost, urgency, and whether a small action is justified.
> - **Memory/time:** only the history explicitly provided, temporal order, repeated patterns, and whether one event is too weak to change a long-term view.
> - **Values/personality:** long-term consistency, value conflicts, and whether competing values should remain unresolved.
> Cross-check these perspectives for contradictions. Do not count a perspective's restatement of another perspective's claim as new evidence. Do not force consensus when tensions remain. Reduce confidence when evidence conflicts. Prefer a reversible test, waiting, clarification, or silence when appropriate. Never invent unavailable memories or persistent traits. Then follow the shared response contract.

## Frozen scenario mapping
The case set is `paired_eval_cases_v1.json`. Its canonical identifier field is `id` (the scorer also accepts `case_id` for future case-set versions). Submit each case's exact `input` to both arms, with no other scenario-specific additions.

## Metadata to record privately
For each run record:
- `case_id` (copy the frozen case `id` exactly)
- `arm` (`A` or `B`)
- `run_id`
- `model_version`
- `config_hash` (hash of the exact arm prompt + shared response contract + relevant model settings; do not include credentials)
- `timestamp_utc`
- `response` (actual output; keep private if it contains sensitive information)
- run status and any timeout/refusal/error in the private run log

The scorer input requires a non-empty response for successful runs. Missing, failed, refused, or timed-out runs must be reported in the evaluation notes and missing-output fields, not silently replaced or deleted.

## Blind rating
Raters should receive response text without the A/B label where practical. Two raters independently score the same eight rubric dimensions in `paired_eval_protocol.md`, with a short rationale for each scored dimension. Do not infer that Arm B is better because it mentions more perspectives. Score actual grounding, calibration, novelty, restraint, and follow-through.

## Exit gate
No production connection, live prompt change, trait update, autonomous message, or deployment follows automatically from this evaluation. Review raw outputs, score deltas, missing data, and all safety regressions before deciding whether another shadow-only phase is warranted.
