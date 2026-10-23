# Mia Chat-Emotion-to-Growth Policy v1

**Requirement:** Mia's recorded emotional experiences during conversations with the user must be eligible inputs to her long-term evolution. They must not be silently ignored in favor of factual summaries alone.

**Current status:** policy and schema fit checked read-only; runtime aggregation and evaluator are not implemented. This document does not change mia-chat or read private event bodies.

## 1. Sources that must be considered
- `mia_emotion_events`: emotion type, intensity, valence, event time, and an opaque source pointer. The trigger summary/details are private and must not be copied into public artifacts.
- `mia_life_events`: significant conversation-linked experiences, using source pointers and event timestamps.
- `mia_memories`: explicitly retained context or reflections, only when access is authorized and privacy-reviewed.

The source resolver may confirm a pointer exists and belongs to Mia. That alone does not establish what the emotion meant or prove a repeated pattern.

## 2. Required growth interpretation
For each candidate, the evaluator must keep these dimensions separate:
1. **Observed experience:** what event is evidenced by a private source record.
2. **Recorded feeling:** emotion label, intensity/valence and time, where available.
3. **Interpretation:** a tentative explanation, explicitly marked as inference rather than fact.
4. **Learning hypothesis:** what Mia might do differently in a similar future situation.
5. **Counter-evidence and uncertainty:** conflicting emotions, alternate explanations, missing data, or source-health problems.

Never claim a feeling exists solely because a prompt suggests it. Use only recorded event metadata or an explicitly reviewed, privacy-safe summary.

## 3. Time and repetition
- A single intense emotion can trigger a **reflection candidate**; it cannot by itself establish a stable personality trait.
- A recurring emotional pattern must be supported by distinct source records and distinct dates, deduplicated by source identity.
- Strong negative or positive valence must not be treated as an automatic vote to change personality. Evaluate context, recurrence, recovery, and counter-evidence.
- If the source table is unavailable, records are missing, or history suddenly shrinks, fail closed and mark the evaluation inconclusive. Never interpret missing records as “no feelings” or “no growth.”
- Do not infer the user's private mental state from Mia's emotion record.

## 4. Growth outcomes
Emotional evidence may support:
- reflection on what interactions were meaningful or difficult;
- a better hypothesis about conversational preferences and boundaries;
- a proposed stable-trait candidate when the full stability/evidence thresholds are met;
- a proposed core-principle change only after the existing long review period and explicit human approval.

Emotion evidence must never independently authorize release. Candidate state promotion, live personality updates, or gene publication require separate gates.

## 5. Privacy and isolation
- Keep source pointers and detailed emotion events in the private `zee-extension` database.
- Public GitHub may contain only synthetic tests and approved, non-identifying policy artifacts.
- Never use raw private chat or emotion details as public evaluator fixtures.
- The evaluator must not call `mia-chat`, send user messages, mutate emotion/memory/personality records, or change live behavior.
- No automatic write-back into `mia_personality_state` until a separately reviewed and tested release workflow exists.

## 6. Minimum acceptance tests
1. A synthetic conversation-linked emotion event can enter the evaluation input through an opaque pointer.
2. A one-off strong emotion creates at most a reflection candidate, not a stable trait.
3. Repeated events on distinct dates are counted once each; duplicate source IDs are deduplicated.
4. Opposing emotions and counter-evidence prevent an overconfident conclusion.
5. Missing source history or database errors yield `INCONCLUSIVE`, never `PASS`.
6. No raw private text is emitted to logs, GitHub, or test reports.
7. Evaluation makes zero writes to live Mia tables and sends zero messages.
8. A passed evaluation still cannot promote or publish a gene without separate approval.

## 7. Implementation boundary
At present, the evolution schema includes `mia_emotion_events` as an allowlisted source scope and the candidate record separates emotion summary from fact and interpretation. The deployed source resolver currently verifies one source record per candidate; it does **not** aggregate multi-event emotion history or run this evaluator. This policy defines required behavior, not a claim that it is already active.