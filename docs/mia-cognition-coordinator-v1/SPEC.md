# Mia Unified Cognition Coordinator V1.0

## 1. Objective
Coordinate existing Mia cognitive perspectives through a stable, inspectable contract. Preserve current Mia identity, chat model/provider, API, prompt, memory, emotion, relationship and personality state. V1.0 is an isolated, deterministic shadow design and test harness only.

## 2. Architecture
    authorized minimal event view
              |
              v
    normalization + provenance + deduplication
              |
              v
    six perspective reports (kept distinct)
      cognition | emotion | relationship
      motivation_action | memory_time | value_personality
              |
              v
    evidence ledger + contradiction/unknown checks
              |
              v
    priority + reversible proposal evaluation
              |
              v
    shadow decision: propose / wait / clarify / silent / park / reject
              |
              v
    audit result (no writes, no external action)

The coordinator does not generate observations. It validates and organizes reports supplied by future adapters. It never treats agreement between perspectives as additional independent evidence.

## 3. Six perspective responsibilities
| Perspective | Allowed contribution | Must not claim |
|---|---|---|
| cognition | facts vs hypotheses, causal alternatives, counter-evidence, unknowns | certainty without source evidence |
| emotion | internal affect cues, intensity, persistence, uncertainty | proof of an external event or another person's intent |
| relationship | relationship context, commitments, boundaries and affected parties | consent or intent not evidenced |
| motivation_action | goals, feasibility, cost, readiness, reversible next steps | authority to execute |
| memory_time | temporal sequence, historical analogues, recency, conflict and expiry | deletion of history due to decay |
| value_personality | consistency with stable values and protected identity | permanent trait change from one event |

Each report has observations, support references, counter-reference references, confidence, unknowns, and recommendation. Reports remain individually visible; they are not collapsed into a majority vote.

## 4. Evidence and provenance
Each evidence reference has:
- ref_id: stable opaque reference
- source_id: original source identity used for deduplication
- kind: observed, verified, or model_generated
- scope: external_fact or internal_state

Rules:
1. A model-generated claim is a hypothesis, not independent evidence.
2. Multiple summaries or perspective reports derived from one source_id count once.
3. Emotion references with internal_state scope may inform affect interpretation but never support an external-world fact.
4. Support and counter-evidence are tracked separately. If both exist, the coordinator marks conflict and does not issue a proposal.
5. No evidence means unknown, not a fabricated conclusion.
6. Confidence is an evidence sufficiency indicator for this contract, not a calibrated probability.

## 5. Temporal relevance
The coordinator may calculate an exponential recency weight for ranking. This weight only changes present relevance. The original event and reference remain in input history; no historical record is deleted or rewritten.

## 6. Candidate and decision rules
Candidate fields are limited to a concise summary, type, importance, potential benefit, risk, reversibility, and requested next step. Raw dialogue is forbidden.

Allowed shadow decisions:
- propose: a reviewable, reversible proposal only
- wait_for_evidence: evidence is missing or contradictory
- ask_clarification: a key fact is unavailable
- stay_silent: no worthwhile candidate
- park: low priority or not timely
- reject: unsafe, non-reversible, or unsupported candidate
- shadow_only: coordinator cannot safely resolve the request

V1.0 never executes a proposal. A proposal requires all six perspective reports, at least one independent eligible support source, no counter-evidence conflict, a reversible next step, and acceptable risk.

## 7. Protected baseline and hard invariants
Every result must explicitly state:
- memory_write = false
- emotion_write = false
- relationship_write = false
- personality_write = false
- message_send = false
- external_action = false
- production_db_access = false

A single event cannot produce a stable personality change. No cross-perspective echo is an independent source. No output from the coordinator is automatically promoted to memory or fact.

## 8. Future integration boundary
A future adapter may be considered only after synthetic tests pass and after separate authorization. It must:
1. use a dedicated read-only role and explicit table/column allowlist;
2. retrieve minimum necessary metadata, not raw dialogue by default;
3. keep source IDs opaque and remove personal text from diagnostics;
4. operate in a separate shadow service with no production write credentials;
5. support a hard stop switch and measurable read audit;
6. compare against current Mia baseline without affecting chat responses.

V1.0 itself has no database adapter and cannot connect to Supabase.

## 9. Non-goals
This prototype does not claim consciousness, sentience, independent subjective experience, complete causal understanding, or production readiness. It tests an auditable coordination contract.