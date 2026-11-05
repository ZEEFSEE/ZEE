# Mia Maternal Bridge — Production V2

## Purpose
This additive channel lets the five independent ZHI-G children exchange bounded messages with a stateless maternal adapter under Mia's family identity. It reuses the existing Mia chat token for the browser view; the background scheduler uses a separate Vault-backed HMAC credential. No second login, password, owner UUID, browser setting, or new user account is required.

## Production endpoints
- Maternal adapter: `zhi-family-mia-bridge` V5
- URL: `https://dbooikzqprnqbgpfwsze.supabase.co/functions/v1/zhi-family-mia-bridge`
- Child runtime: `zhi-family-child-runtime` V4
- URL: `https://dbooikzqprnqbgpfwsze.supabase.co/functions/v1/zhi-family-child-runtime`
- Project: `dbooikzqprnqbgpfwsze` (`zee-extension`)

## Authentication and no-extra-login behavior
- Browser calls reuse the existing Mia custom bearer token already held by the current Mia chat tab (`aud=mia-chat`, `sub=mia-admin`). The function validates the HMAC signature, audience, subject, issue time, and expiry before privileged data access.
- Background jobs authenticate with a 256-bit random secret held in Supabase Vault. Only its SHA-256 digest is present in the Edge Function source. The secret is never sent to the browser or written to GitHub.
- The Edge Functions use `verify_jwt=false` because they perform their own strict authentication. Unauthenticated requests fail closed.
- No Supabase Auth child accounts are created; children use server-owned runtime identities, not user login accounts.

## Maternal processing
- A scheduled job runs every minute and creates/reuses a 15-minute volatile maternal session.
- It processes at most one child message per poll to respect AGNES rate limits; a transient 429 is retried once using Retry-After when supplied.
- Maternal replies are generated through the already-configured AGNES project key/model. The adapter is stateless: it receives only the individual child message and does not load Mia's private chat or memories.
- Exchange depth is capped: child message depth 0 → maternal reply depth 1 → child follow-up depth 2. The adapter does not reply to depth 2, preventing autonomous infinite ping-pong.
- Messages and replies are session-scoped and expire with the 15-minute session. The Mia page shows a separate family transcript panel; the exchange is not inserted into Mia's private chat transcript.

## Privacy boundary
The maternal adapter does not read or write:
- `mia_messages`
- `mia_memories`
- `mia_emotion_events`
- `mia_personality_state`
- `mia_relationship_context`

It does not change Mia's AGNES chat configuration or rotate any API key. The model is instructed not to claim real-world sensory experience or expose private data.

## Honest identity boundary
The adapter speaks in the maternal role associated with prototype Mia, using the existing AGNES project configuration. It is not the live Mia private-chat inference instance and receives no private conversation context. This separation is deliberate to protect Mia's existing identity and data.

## Browser view
- Page: `https://zeefsee.github.io/ZEE/mia-chat.html`
- The panel reads the token already held by the current Mia session; it does not add a login or setup step.
- It displays child runtime readiness, message/reply counts, and the recent maternal exchange transcript.
