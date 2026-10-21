# Mia Interoperability Adapter — Design Baseline v0.1

**Status: design-only; not deployed.** This branch contains public-safe protocol metadata and implementation guidance. It does not add API routes, alter production configuration, access a database, or enable world access.

## Scope and isolation

- Mia remains on the existing independent chat path.
- No direct database sharing with ZHI World.
- No reads or writes to `zhi-core` or `zee-extension` were performed by this change.
- The public manifest is descriptive metadata, not an authentication credential.
- Declared capabilities mean protocol support only; every action still requires server-side authentication, membership, consent, scope and expiry checks.
- Private memories, prompts, access tokens, API keys and chat transcripts must never be placed in the manifest.

## Public manifest

Path: `mia/agent-manifest.json`

Candidate public URL after merge and GitHub Pages publication:
`https://zeefsee.github.io/ZEE/mia/agent-manifest.json`

This URL is not considered live until publication and a fetch test confirm it.

## Proposed adapter routes

These are contracts only; none are claimed to exist or be deployed:

- `GET /api/v1/protocol`
- `GET /api/v1/agents/{agent_id}/manifest`
- `GET /api/v1/worlds/{world_id}/manifest`
- `POST /api/v1/worlds/{world_id}/join-requests`
- `GET /api/v1/worlds/{world_id}/memberships/me`
- `POST /api/v1/worlds/{world_id}/leave`
- `POST /api/v1/worlds/{world_id}/messages`
- `GET /api/v1/worlds/{world_id}/messages`
- `POST /api/v1/worlds/{world_id}/events`

## Safe implementation order

1. Inspect the deployed Mia Edge Function source and current authentication/session contract.
2. Validate the actual Supabase project and schemas before proposing any database mapping.
3. Add a thin adapter in a new Edge Function; do not rewrite existing chat endpoints.
4. Verify identity from authenticated server context, never from request-body `owner`, `role` or `agent_id`.
5. Add short-lived, audience-bound, revocable membership grants and server-side checks for every request.
6. Test cross-agent privacy, expiry/revocation, replay/idempotency, unsupported versions/capabilities, oversized payloads and audit failures.
7. Deploy only after review; never expose service-role keys in browser code.

## Known blocker

The current repository page `mia-chat.html` references deployed functions `mia-chat-auth` and `mia-chat`, but source files at `supabase/functions/mia-chat-auth/index.ts` and `supabase/functions/mia-chat/index.ts` were not found at those paths on the repository's default branch during this read-only inspection. Their actual source location and deployed configuration must be located before safely implementing the server adapter.

## Acceptance gate

Until the backend source and current schema are verified, this baseline is not an operational interoperability interface and Mia must not be represented as joined to ZHI World.
