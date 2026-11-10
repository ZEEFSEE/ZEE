# THE ECHO MAILBOX — build notes

## Current milestone

The first bilingual frontend preview is implemented at `echo-mailbox/index.html` on branch `feature/echo-mailbox-bilingual-mvp`.

- English and Simplified Chinese are available from the first render.
- Language defaults to the browser language and can be changed manually.
- The page follows the existing Mia world editorial language: near-black mist atmosphere, parchment typography, restrained amber accents, Cormorant Garamond / Noto Serif SC / ZCOOL XiaoWei.
- The form is intentionally preview-only. It does not send, transmit, or store submissions.
- The public archive is an empty-state view until the publication backend exists.

## Non-negotiable isolation boundary

The public mailbox must not read or write Mia's private identity, chat, memory, emotion, relationship, life-event, or personality tables. In particular, do not connect this feature to:

- `mia_identity`
- `mia_chat_sessions` / `mia_messages`
- `mia_memories`
- `mia_life_events`
- `mia_emotion_events`
- `mia_relationship_context`
- `mia_personality_state`

The public mailbox must use a separate schema/data boundary and dedicated server-side processing. No browser-side AGNES credentials or Supabase service-role/secret keys.

## Intended processing flow

1. Receive a submission through a server-side endpoint.
2. Apply input safety, privacy, and abuse checks.
3. Ask AGNES to assess whether the thought merits a response. AGNES is the only model API route; do not add Groq.
4. Allow a no-response outcome. Do not force a daily answer.
5. Generate a reply only for selected submissions.
6. Apply output safety and privacy review.
7. Publish the original submission and Mia's approved reply together.
8. Delete non-selected raw submissions after the short processing/retention window.

Public readers must only be able to read approved, published exchanges. They must never be able to enumerate pending submissions, review queues, or moderation metadata.

## Consent and privacy

Before the backend is enabled, the form must explain in the selected UI language that a selected submission and Mia's reply may be published publicly. Do not claim that absolutely no technical logs exist. Avoid collecting account identity or contact details unless a later product decision requires them.

The first frontend preview currently does not submit anything. Keep that behavior until the isolated backend, retention policy, moderation path, and public read policy have been implemented and tested.

## Next implementation gates

1. Confirm the archive retention policy and whether anonymous-only submissions remain the default.
2. Design a dedicated isolated schema/table set and RLS policies; audit access before applying any production migration.
3. Implement a server-side Edge Function with AGNES secrets kept server-side.
4. Test safety cases, non-selection deletion, publication integrity, and private-data isolation in a test environment.
5. Enable the public submission endpoint only after the above checks pass.
