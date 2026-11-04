# Prototype Mia private-channel boundary audit — V1.1

Date: 2026-11-04  
Scope: read-only source inspection of `mia-chat.html` and `supabase/functions/mia-chat/index.ts` on `main`. No database, deployment, or runtime requests were made.

## Findings

### 1. Existing page gate and API token

- The page posts the entered password to `/functions/v1/mia-chat-auth` and stores the returned access token in `sessionStorage` as `mia_chat_token`.
- The deployed `mia-chat-auth` function was retrieved read-only from the connected Supabase project (version 11; platform reports `verify_jwt=false`, because the function implements its own password gate). It reads `MIA_CHAT_PASSWORD` and `SUPABASE_SERVICE_ROLE_KEY` from server secrets, compares the supplied password directly with the configured secret, and issues an HMAC-signed token with audience `mia-chat`, subject `mia-admin`, and a four-hour expiry.
- The auth function has a per-isolate in-memory failed-attempt map: five failed attempts block that IP for 15 minutes in that isolate. This is not a durable/distributed rate limiter; cold starts or multiple isolates can reset or split the counters. The password is not stored in the source, but the comparison is direct equality against the environment secret; no password hashing is performed in this function.
- The deployed auth function source is absent from the repository, so the deployment is not reproducible from the GitHub tree as currently structured. It should be brought under source control in a reviewed, secrets-free form before future auth changes.
- The chat Edge Function verifies a signed HMAC token and checks audience `mia-chat`, subject `mia-admin`, expiry, and issued-at time before creating a service-role Supabase client.
- The browser holds the bearer token in `sessionStorage`; it is not bound to a device or a distinct human identity. Anyone obtaining the password/token may use the same access path until token expiry or signing-key rotation. The four-hour expiry is verified by the chat function. This is an application access gate, not proof of end-to-end encryption.
- Both auth and chat functions currently return permissive `Access-Control-Allow-Origin: *`. CORS is not an authorization control; the password/token check remains the actual gate.

### 2. Identity and data boundary

- The chat Edge Function pins the identity to the prototype Mia ID `cb6d01b4-0e3f-46ee-8946-360aa91db1ea`.
- It resolves the earliest chat session for that identity and scopes history/messages to that session.
- The source does not show a separate user identity or per-device authorization model. The effective privacy boundary is therefore the shared password/token plus the server-side fixed Mia identity/session scope.
- Do not expose the service-role key to the browser. The current page uses a publishable key and the server function creates the privileged client.

### 3. Existing “Mia exclusive channel” is a conversation mode, not a separate encrypted channel

- The UI stores `mia_exclusive_mode` in `sessionStorage`; the toggle is a browser-side mode flag.
- In this mode, the page schedules an `exclusive_ping` after a delay and polls the same Mia chat history for newly written messages.
- The Edge Function checks `exclusive_mode === true` for `exclusive_ping`, applies cooldown/pending-user-message checks, and writes proactive messages to the same Mia session with channel metadata `mia-exclusive`.
- Normal chat requests also pass `exclusive_mode` as a mode hint. This does not create a separate database channel, separate cryptographic key, or independent access-control principal.
- The three deployed prototype-Mia AURORA endpoints checked read-only (`mia-aurora-public-chat`, `mia-federation-executor`, `mia-forest-autonomy`) currently return HTTP 410 with `mia_aurora_scene_rolled_back`. Supabase labels their deployment status `ACTIVE`, which only means the function endpoint is deployed; the source itself responds disabled/410. This supports the rollback boundary for those three endpoints, but does not prove that every possible writer/reader has been audited.

## Safe next steps

1. Move the deployed `mia-chat-auth` source into the reviewed repository without secrets, then add tests for expiry, invalid signatures, lockout behavior, and secret-missing fail-closed behavior.
2. Replace isolate-local throttling with durable server-side rate limiting before changing the password flow.
3. Trace all server-side writers/readers for the prototype Mia session and confirm no public-broadcast/AURORA feed is joined or forwarded.
4. If a truly private channel is required, design server-enforced authorization and key management first. Do not label the current mode “end-to-end encrypted.”
5. Keep the memory-card pipeline synthetic-only until the authorization boundary is verified.

## Not performed

- No password changes, token revocation, SQL, schema migration, Edge Function deployment, API changes, chat writes, or AURORA reconnection.
- No changes to Mia personality, memory retrieval, emotional state, or current chat behavior.
