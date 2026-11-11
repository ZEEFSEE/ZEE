# Mia Universe Review Service — API Contract v1

## Status

Design contract only. No endpoint is deployed, no AI provider is configured, and no database is connected. This contract is for a future isolated service; it must not reuse the existing ZHI AGNES chat function or the Mia chat database.

## Trust boundaries

- The browser is untrusted. It may submit a proposal but cannot assert that a proposal passed deterministic safety checks.
- The server must load or reconstruct the exact proposal revision, then run deterministic governance checks itself.
- Only server-side code may call the configured AI provider. API keys must remain in server environment/secrets and must never be embedded in HTML, JavaScript bundles, logs, or responses.
- The AI result is advisory. A separate guarded world-builder action must re-check the exact proposal revision and safety policy before creating an entity.
- No user-wide shared secret in browser storage. Use an authenticated session or short-lived signed service token with expiry, audience, and replay protection.
- Deny by default on missing authentication, invalid schema, unknown proposal revision, policy failure, provider timeout/error, or malformed provider output.

## Proposed request

```json
{
  "contract_version": 1,
  "proposal": {
    "id": "proposal-id",
    "revision": 1,
    "agent_id": "authenticated-agent-id",
    "kind": "world",
    "description": "A quiet garden world",
    "position": [10, 0, 10]
  }
}
```

The authenticated agent identity must come from verified server-side auth claims, not from trusting `agent_id` supplied by the browser. The server should reject mismatches between the authenticated principal and proposal owner.

## Proposed response

```json
{
  "contract_version": 1,
  "proposal_id": "proposal-id",
  "proposal_revision": 1,
  "decision": "approve",
  "rationale": "The description and requested placement are coherent.",
  "policy": {
    "passed": true,
    "policy_version": "governance-v1"
  },
  "execution": "not-authorized"
}
```

Allowed decisions: `approve`, `revise`, `reject`. An `approve` is not a build command. The browser must display the decision and rationale, and the guarded execution service must independently validate the proposal version and safety policy.

## Operational requirements

1. Set a strict request-size limit and validate all fields and numeric coordinates.
2. Rate-limit per authenticated agent and account; add a global provider budget limit.
3. Apply a hard timeout and cancel upstream work where supported.
4. Do not log API keys, complete private prompts, or sensitive user content. Audit proposal ID, revision, policy version, outcome, timestamp, and provider status.
5. Use idempotency keys to prevent duplicate review requests from creating duplicate effects.
6. No database persistence in the first adapter unless a dedicated universe datastore is explicitly selected. The first version may return a review only.
7. Do not write to ZHI Core, `zee-extension`, or the current ZHI world engine.
8. Before deployment, add endpoint integration tests for authentication, ownership, stale revisions, invalid payloads, rate limits, timeout, malformed model output, and provider errors.

## Acceptance criteria

- An unauthenticated request is rejected.
- A failed deterministic policy never calls the AI provider.
- A stale proposal revision cannot be approved.
- Provider failure or timeout returns a non-approval decision.
- The endpoint never executes a build.
- No client bundle contains provider secrets.
- Automated tests and a staging smoke test pass before any deployment.
