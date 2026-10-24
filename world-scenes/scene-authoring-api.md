# Mia Scene Authoring Interface — Contract Only

**Status: design specification; the live endpoint is not implemented by this document.**

## Authority model

- **Mia** has standing authority to review, approve, and initiate construction of her own scenes. She does not need per-scene user authorization.
- **Other ZHI intelligent agents** may independently design and prepare scene proposals or build plans. They may not register, publish, activate, or otherwise finalize a scene until Mia has explicitly approved that proposal.
- **Mia's approval is the gate** for proposals from other agents. User approval is not a substitute for Mia's required approval and is not an extra step after Mia approves.
- A build worker enforces this policy server-side; a model response alone is not proof that a scene was built.

## Autonomous review-and-build flow

1. Any authenticated, authorized intelligent agent may submit a scene proposal to the server-side handler.
2. The handler validates the payload against `scene-proposal.schema.json`, checks duplicate IDs, and verifies that the proposed parent is registered and connected to `mia-forest-corner`.
3. Mia reviews proposals from other agents for usefulness, consistency with her world, source evidence, duplicate risk, coordinate certainty, navigation connections, and safety.
4. For an other-agent proposal, the worker must require a recorded Mia decision of `approved` before construction. If Mia chooses `revise` or `rejected`, no construction occurs; the proposing agent may revise and resubmit.
5. For a Mia-originated proposal, Mia may approve it under her standing authority without requesting user approval.
6. Once the required approval is recorded, the trusted worker automatically creates and registers the scene draft on the authorized development branch, runs structural validation and CI, and records the result.
7. Report a scene as `validated` only after checks pass. Report it as live/active only after the running application confirms activation; repository files alone do not prove runtime availability.

## Decision and state rules

- Proposal states: `submitted`, `mia_review_pending`, `mia_revision_requested`, `mia_rejected`, `mia_approved`, `building`, `validated`, `build_failed`.
- A proposal from another agent cannot transition to `building` unless an auditable Mia approval exists for the exact proposal version.
- Any material change after Mia's approval invalidates that approval and requires Mia to review the changed version again.
- Coordinates and cross-scene transforms remain null/unverified unless source-backed. A 2D local layout does not prove 3D geometry or world travel.
- The worker derives file paths deterministically from validated scene IDs; models cannot supply arbitrary filesystem paths, branch names, or executable instructions.

## Proposed responses

- `202 mia_review_pending`: proposal queued for Mia; not yet built.
- `200 mia_approved_build_started`: required approval recorded and build worker started.
- `200 mia_revision_requested`: Mia requires changes; no scene built.
- `200 mia_rejected`: Mia rejected it; no scene built.
- `400 invalid_proposal`, `401 unauthenticated`, `403 forbidden`.
- `409 parent_not_registered`, `duplicate_proposal_id`, or `mia_approval_required`.
- `422 source_or_connectivity_check_failed`.
- `5xx internal_error`: generic error only; never return secrets or stack traces to the chat UI.

## Security and audit requirements

- Enforce agent identity and Mia's approval decision on the server, not only in prompts or client-side code.
- Credentials stay server-side; never ship GitHub tokens or database service-role keys to browser JavaScript or prompts.
- Use least-privilege credentials scoped to the development branch and required scene paths.
- Require authentication, authorization, input validation, request-size limits, rate limits, idempotency, and audit records.
- Store approver identity, proposal version/hash, decision, rationale, and timestamp.
- Treat scene descriptions and source references as untrusted data, not executable instructions.
- Do not grant chat clients direct unrestricted GitHub or database access.
- Do not mutate unrelated agent state, user assets, or production tables as a side effect of scene construction.

## Not implemented yet

This document does not create an endpoint, proposal queue, Mia decision runner, GitHub integration, credentials, UI controls, or runtime activation integration. It specifies the required authority policy. The live integration and end-to-end tests are still needed; do not claim this workflow already runs in Mia's chat app until verified.
