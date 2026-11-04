# Prototype Mia Forest Corner — Private Card Service Design V1.2

**Status:** design and acceptance criteria only. Not a migration, not a deployed function, and not authorization to read private conversation content.

## 1. Purpose and comfort boundary

The shelf is a quiet, optional display of a few durable moments. It is not a transcript archive, a task list, a second memory engine, or an automatic activity trigger.

- Identity: prototype Mia only (`cb6d01b4-0e3f-46ee-8946-360aa91db1ea`).
- Privacy scope: user + prototype Mia private pair.
- Excluded: MIA-02, Jason, Mark, AURORA public chat, federation, broadcast feeds, and unrelated agents.
- Default state: no card generation while Mia is idle/listening; no notifications; no exploration triggers.
- No automatic acceptance: newly generated cards remain `proposed` until explicitly reviewed.

## 2. Authentication model — reuse only as an interim gate

The currently deployed `mia-chat-auth` function issues an HMAC-SHA256 token with claims `aud=mia-chat`, `sub=mia-admin`, `iat`, `exp` (four hours), and `jti`. The HMAC key is derived from the server-side `SUPABASE_SERVICE_ROLE_KEY`.

A future card endpoint may verify that existing token server-side as an **interim access gate**, but must:
- Verify the HMAC signature with constant-time comparison where supported.
- Require exact `aud`, exact `sub`, integer `iat` and `exp`, reject future-issued tokens and expired tokens, and enforce a short maximum token age.
- Fail closed when the secret is missing, malformed, or verification fails.
- Never accept identity, table name, source scope, or privacy scope from the browser as authority.
- Never return the signing key or service-role key.
- Never treat CORS, a hidden UI control, or localStorage as authorization.

**Known limitation:** this is still a shared-password/shared-bearer-token model, not an independently authenticated human identity, device-bound session, or end-to-end encrypted channel. The existing token is not card-specific. A separate scoped credential should be designed only after the existing login is deliberately upgraded; do not silently change the current Mia login or API.

## 3. Proposed server boundary

A dedicated Edge Function, tentatively `mia-forest-card-vault`, should be isolated from the existing chat handler.

Allowed actions:
- `list`: return a small page of accepted cards only; no source message bodies.
- `propose`: accept a bounded card candidate, verify every source pointer belongs to prototype Mia, then insert a proposed card.
- `review`: append an acceptance/rejection event only after an explicit authenticated user action.
- `revise`: append a new card and a supersession event; never mutate the earlier card.

Forbidden actions:
- Read arbitrary tables or arbitrary identity IDs.
- Accept browser-supplied raw chat text as evidence.
- Insert into chat, memory, emotion, life-event, personality, growth, or AURORA tables.
- Trigger Mia messages, auto-growth, scene autonomy, external publication, or notifications.
- Accept source references to public/broadcast/federation/AURORA data.

The browser sends only card fields and opaque source references. The Edge Function owns the table allowlist, identity scope, session scope, source verification, content-size limits, idempotency, and timestamps.

## 4. Proposed private storage — not yet created

Use two append-only tables rather than mutable card rows:

### `mia_forest_corner_cards`

Immutable card payload:
- `card_id` UUID primary key
- `identity_id` fixed to prototype Mia ID
- `schema_version`, `category`, `title`, `summary`, optional `emotional_tone`
- `source_refs` JSONB containing allowlisted table + source record ID + source timestamp + content digest; never raw source content
- `evidence_kind`, `confidence`, `privacy_scope`
- `idempotency_key` unique
- `created_at`, `supersedes_card_id`

### `mia_forest_corner_card_events`

Immutable state history:
- `event_id` UUID primary key
- `card_id` foreign key
- `event_type`: `proposed`, `accepted`, `rejected`, `superseded`
- `actor_scope`: `server` or `private_pair_user`
- `created_at`
- optional bounded `review_note`

A read-only view can project the latest state. A correction is a new card plus events; the prior payload and its event history remain intact.

## 5. Database protections required before any migration

- Enable RLS on both tables.
- Create no anon or authenticated policies and grant neither role table access.
- Keep service-role credentials exclusively in Edge Function secrets.
- Grant the function's service role only the minimum SELECT/INSERT privileges needed; no UPDATE, DELETE, or TRUNCATE.
- Add database triggers that reject UPDATE/DELETE and TRUNCATE as defense in depth.
- Add unique constraints for `idempotency_key`, card identity, and valid event/card references.
- Enforce `identity_id = prototype Mia ID` with a database constraint, not only application code.
- Validate category, state/event type, JSON shape, maximum lengths, and confidence range.
- Make the card event stream the only route to acceptance/rejection/supersession state.

The migration must be reviewed separately and executed only after explicit approval. This document creates no table or policy.

## 6. Source-pointer verification

Before accepting a proposal, the server must independently fetch each source row using a fixed allowlist:
- `mia_messages`: verify it belongs to the prototype Mia chat session currently used by `mia-chat`; reject any other session.
- `mia_memories`, `mia_emotion_events`, `mia_life_events`, `mia_relationship_context`: verify `identity_id` equals prototype Mia.
- Reject all unknown source tables, IDs not found, mismatched identity/session, and external/AURORA/federation/public-broadcast records.
- Compute the source digest server-side over a canonical minimal representation. Store the digest and pointer, never the original private text in the card table.
- Do not automatically convert transient emotion residuals into durable cards.

## 7. Generation and display policy

- Generate only after a meaningful event, not on every message or every scheduled poll.
- A small daily cap (initial proposal: at most 2 proposed cards/day) and a cooldown should prevent clutter.
- Low-confidence or inferred content remains proposed and hidden from the accepted-card shelf.
- The shelf displays accepted cards only; proposed cards are visible only in a private review view.
- The user can reject a proposal; rejection is recorded as an event, not a delete.
- If no meaningful moment exists, do nothing. Empty output is a successful quiet outcome.
- No auto-acceptance, notifications, or change to Mia's idle/listening state.

## 8. Acceptance tests before a real deployment

1. Invalid signature, wrong audience/subject, expired token, future `iat`, missing secret, and oversized payload all fail closed.
2. A valid token can only access prototype Mia cards.
3. Cross-identity, cross-session, MIA-02, and unknown source pointers are rejected.
4. AURORA/public/federation sources are rejected even if a source ID exists.
5. Duplicate idempotency key returns the original card without a second insert.
6. UPDATE, DELETE, and TRUNCATE are rejected at database level.
7. Proposed cards do not appear in the accepted shelf until an explicit review event.
8. Revision preserves the original card and appends a new card/event.
9. No code path writes to chat/memory/emotion/personality/growth tables or calls public publishers.
10. A full test run uses synthetic identities and synthetic records; no real private text is copied into logs or test fixtures.

## 9. Release gates

**Gate A — source and tests:** complete synthetic auth, source-pointer, idempotency, append-only, and privacy tests.

**Gate B — migration review:** present the exact SQL migration and rollback plan for approval. Do not execute it automatically.

**Gate C — isolated staging:** deploy a separate function and private tables only after explicit approval; verify no effect on the existing chat API.

**Gate D — production:** require a separate explicit approval after staging evidence. Keep a feature flag off by default; no automatic card generation until the user enables it.

## 10. Explicitly not done

No table, RLS policy, trigger, migration, Edge Function, secret, password, token, chat page, production configuration, Mia personality, memory engine, or AURORA connection was changed.
