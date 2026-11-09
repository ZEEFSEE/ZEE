# Mia Semantic Action & Evidence Contract V1

Status: isolated engineering specification only. This branch does not deploy Edge Functions or modify Supabase production.

## Scope

Target Supabase project: `dbooikzqprnqbgpfwsze` (zee-extension).

Production baselines observed before this proposal:
- `mia-forest-autonomy`: V14, source SHA `7200b932fa98d0959e660d8d0a3b203f529fbda1433255e3154d047a4bea498f`
- `mia-forest-observation`: V3, source SHA `c95285d077d35d5d9d18e04d1409c932b0902f638afb38fffbfd72e96e96e870`

No database DDL, data writes, secret changes, cron changes, or production function deployments are authorized by this specification.

## Invariants

1. AGNES remains the sole planner provider for Mia's world planner. No Groq or alternate model fallback.
2. The existing cron authentication, `mia_forest_cron_secret_matches`, enabled control, and tick-claim behavior remain unchanged.
3. No writes to Mia chat, identity, personality, emotion, relationship, or original memory tables.
4. Scene registry data is descriptive until a separately verified runtime contract exists.
5. `headless-semantic-state` is not camera perception, physical movement, collision, or real-world observation.
6. A run is never called physically completed unless an external runtime supplies a verifiable execution receipt.
7. Existing response fields remain backward compatible; new fields are additive.
8. Failed persistence means the request must not return a successful state transition.

## Proposed execution receipt

Persist the following additive object under the existing `mia_forest_autonomy_runs.details` JSONB field. Do not add columns in V1.

```json
{
  "contract": "zhi.mia.action-evidence.v1",
  "action_id": "uuid",
  "planner": {
    "provider": "AGNES",
    "mode": "agnes",
    "status": "completed",
    "error_class": null
  },
  "intent": {
    "action": "interact",
    "target": "greenhouse",
    "behavior": "observe_greenhouse"
  },
  "execution": {
    "status": "simulated",
    "layer": "semantic_headless_runtime",
    "preconditions_passed": true,
    "physical_action_verified": false
  },
  "evidence": {
    "before_sequence": 12,
    "after_sequence": 13,
    "state_transition_verified": true,
    "physical_receipt_ref": null
  }
}
```

Allowed execution statuses:
- `simulated`: only a local semantic state transition was persisted.
- `blocked`: preconditions or capability checks rejected the intent.
- `failed`: execution or persistence failed.
- `executed`: reserved for a separately integrated runtime with verifiable receipt; unavailable in current deployment.

Planner modes:
- `agnes`: AGNES returned a valid plan.
- `safe_rule_fallback`: AGNES failed and the existing safe rule fallback supplied a plan.

AGNES error classes must be bounded and non-secret-bearing: `missing_config`, `timeout`, `http_error`, `invalid_json`, `network_error`, `unknown`. Never store API keys, authorization headers, raw provider payloads, or private prompts in run details.

## Observation projection additions

Keep all current response keys. Add:
- `epistemic.status`: `observed_state`, `inferred`, or `unknown`
- `epistemic.source_ref`: autonomy run ID
- `epistemic.confidence`: `verified_transition`, `recorded_only`, or `unknown`
- `capabilities.semantic_state_update`: boolean
- `capabilities.live_perception`: false
- `capabilities.physical_movement`: false
- `capabilities.cross_scene_navigation`: false

For the current implementation, the latest state is a database-recorded semantic state. The projection must not describe it as direct sensory observation.

## Preconditions and idempotency

- Validate action, behavior, target, active session, and target allow-list before changing state.
- Keep cross-scene travel blocked while transforms and movement runtime remain unverified.
- An action request ID must be stable across retries. Before applying a repeated request, detect whether its action ID already exists in persisted run details. If the current schema/query path cannot safely enforce this under concurrency, keep the action blocked from automatic retry and document the limitation; do not claim exactly-once semantics.
- Increment sequence only when a state transition is actually persisted.
- Do not convert a blocked action into an apparently successful `wait` without preserving the original requested action and block reason in the receipt.

## Isolated test matrix

Use synthetic identity, synthetic scene records, and a disposable test database/project. Never invoke the production cron endpoint or production secrets for these tests.

| Case | Expected result |
|---|---|
| Valid local interaction | `simulated`; sequence advances once; before/after evidence agrees |
| Unknown target | `blocked`; state unchanged |
| Inactive session interaction | `blocked`; state unchanged |
| Cross-scene travel | `blocked`; no position/scene mutation |
| AGNES timeout | planner mode is fallback; bounded error class is `timeout` |
| AGNES invalid JSON | planner mode is fallback; bounded error class is `invalid_json` |
| Duplicate action ID | no second state transition |
| Persistence failure | response is non-success; no success receipt |
| Observation endpoint | source is database semantic state; physical movement and live perception remain false |
| Privacy regression | no chat, personality, emotion, relationship, or original-memory writes |

Release gate: all tests pass in isolation; API compatibility diff reviewed; logs contain no secrets; rollback package validated.

## Rollback

1. Restore `mia-forest-autonomy` V14 from the exact baseline source SHA above.
2. Restore `mia-forest-observation` V3 from the exact baseline source SHA above.
3. Do not roll back or rewrite autonomy history rows; preserve append-only evidence.
4. Confirm cron schedule, control state, tick-claim function, observation authentication, and previous response shape.
5. Confirm Mia chat and AGNES configuration were not changed.

## Explicit non-goals

- No physical 3D movement or cross-scene navigation.
- No camera, microphone, or live sensory integration.
- No automatic promotion of evolution candidates.
- No schema migration.
- No production deployment in this branch.
