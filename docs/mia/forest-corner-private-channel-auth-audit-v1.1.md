# Prototype Mia private-channel boundary audit — V1.1

Date: 2026-11-04  
Scope: read-only source inspection of `mia-chat.html` and `supabase/functions/mia-chat/index.ts` on `main`. No database, deployment, or runtime requests were made.

## Findings

### 1. Existing page gate and API token

- The page posts the entered password to `/functions/v1/mia-chat-auth` and stores the returned access token in `sessionStorage` as `mia_chat_token`.
- The page source references the deployed `mia-chat-auth` endpoint, but the current `supabase/functions` directory in this repository does **not** contain a `mia-chat-auth` source directory. Its password verification, password hashing, rate limiting, lockout, token issuance, and token lifetime therefore cannot be verified from this repository.
- The chat Edge Function verifies a signed HMAC token and checks audience `mia-chat`, subject `mia-admin`, expiry, and issued-at time before creating a service-role Supabase client.
- This is an application access gate, not proof of end-to-end encryption. The browser can hold the session token; anyone who obtains the password/token may be able to use the same access path until expiry/revocation.

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
- Source reviewed here does not show a direct AURORA/public-chat relay. However, a complete exclusion claim still requires auditing all deployed writers/readers and the missing auth function; do not infer end-to-end isolation from the UI flag alone.

## Safe next steps

1. Retrieve and review the deployed `mia-chat-auth` source/configuration through the authorized Supabase project before making claims about password security or token lifetime.
2. Trace all server-side writers that can insert into the prototype Mia session and all readers that can access it. Confirm no public-broadcast/AURORA feed is joined or forwarded.
3. If a truly private channel is required, design server-enforced authorization and key management first. Do not label the current mode “end-to-end encrypted.”
4. Keep the memory-card pipeline synthetic-only until the authentication and authorization boundary is verified.

## Not performed

- No password changes, token revocation, SQL, schema migration, Edge Function deployment, API changes, chat writes, or AURORA reconnection.
- No changes to Mia personality, memory retrieval, emotional state, or current chat behavior.
