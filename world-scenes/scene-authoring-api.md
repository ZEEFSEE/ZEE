# Mia Scene Authoring Interface — Contract Only

**Status: design specification; no live endpoint is implemented by this document.**

## Goal

Allow Mia's chat UI to suggest an expandable scene while keeping the running world, GitHub repository, and production database protected. The first integration should create a **proposal**, not commit files or publish a scene.

## Proposed flow

1. Chat UI sends a scene proposal to a server-side authenticated handler.
2. Handler validates the payload against `scene-proposal.schema.json`.
3. Handler verifies that `parent_scene_id` exists in the current registered catalog and is connected to `mia-forest-corner`.
4. Handler stores the proposal in a dedicated proposal queue with status `pending_review`. Storage is not configured by this specification.
5. User reviews the proposal and explicitly approves or rejects it.
6. Only after approval does a trusted server-side worker create a draft on the development branch, run scene validation and CI, and report the resulting commit/PR URL.
7. Human review remains required before merging. No direct write to `main`, no production deployment, and no scene activation from a chat message alone.

## Proposed request

A JSON object conforming to `scene-proposal.schema.json`. Required data includes a unique proposal ID, requester, display name, registered parent scene ID, description, source reference, and `pending_review` status. Coordinates are optional and must remain null or explicitly unverified unless backed by a source.

## Proposed responses

- `202 proposal_pending_review`: accepted for review; not a scene and not visible in the live world.
- `400 invalid_proposal`: malformed payload or unsupported fields.
- `401 unauthenticated` / `403 forbidden`: requester not authorized.
- `409 parent_not_registered` or `duplicate_proposal_id`.
- `422 source_or_connectivity_check_failed`.
- `5xx internal_error`: generic error only; never return secrets or stack traces to the chat UI.

## Security requirements

- API credentials and GitHub token stay server-side; never ship them to browser JavaScript or Mia's prompt.
- Use least-privilege credentials scoped to the development branch or a proposal-only storage table.
- Require authentication, authorization, request-size limits, input validation, rate limits, audit records, and idempotency by proposal ID.
- Treat scene descriptions and source references as untrusted data, not executable instructions.
- Never allow the model to choose arbitrary repository paths, branch names, URLs to fetch, SQL, or filesystem paths.
- Do not grant the chat UI direct Supabase service-role or unrestricted GitHub write access.
- Proposal creation must not mutate agent state, world coordinates, user assets, or production tables.

## Not implemented yet

This document does not create an endpoint, queue/table, GitHub App, credentials, UI controls, or runtime integration. A real integration requires choosing the server runtime and storage location, implementing authentication and approval, and testing in a non-production environment first.
