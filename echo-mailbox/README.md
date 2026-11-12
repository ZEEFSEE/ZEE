# THE ECHO MAILBOX — ZEEFSEE/ZEE deployment

## Deployment target

The public static page is hosted with the ZEEFSEE/ZEE GitHub Pages site at:

`https://zeefsee.github.io/ZEE/echo-mailbox/`

The page follows Mia's established visual language: near-black mist, parchment typography, restrained amber accents, Cormorant Garamond / Noto Serif SC / ZCOOL XiaoWei. It is bilingual from the first release, with browser-language detection and a manual 中文 / EN switch.

## Current release state

The frontend is wired to the dedicated `echo-submit` Supabase Edge Function endpoint and reads only the public `echo_publications` archive. The currently deployed function is reported as ACTIVE. This does **not** by itself prove that production environment flags, credentials, AGNES connectivity, and the complete submission-to-publication path are working.

No production test submission is generated as part of a deployment check, because a successful test could create a public entry. The production end-to-end path remains **not independently verified** until an explicitly consented real submission completes and its result is checked. The page must continue to report exact outcomes: published, Mia silent/refused, safety review not passed, duplicate/rate limited, or unavailable. Never display a failure as a published echo.

## Mandatory privacy boundary

The public mailbox must never read or write Mia's private identity, chat, memory, emotion, relationship, life-event, or personality tables, including:

- `mia_identity`
- `mia_chat_sessions` / `mia_messages`
- `mia_memories`
- `mia_life_events`
- `mia_emotion_events`
- `mia_relationship_context`
- `mia_personality_state`

Use a dedicated isolated schema and service-only processing. No browser-side AGNES credentials, Supabase service-role keys, or private memory data.

## Required automated flow before activation

1. Receive a submission with explicit public-display consent.
2. Run automated input safety, privacy, abuse, and prompt-injection checks.
3. Ask AGNES (the only model API route) to assess meaning and selection.
4. Let Mia choose whether to answer; silence is a valid result.
5. Generate a reply only for selected submissions.
6. Run automated output safety and privacy checks on the reply.
7. Re-check the original question and answer as one publication unit.
8. Publish only if every gate returns an explicit pass; all errors, timeouts, uncertain results, and missing checks fail closed.
9. Delete non-selected raw submissions under a short, enforced retention window.
10. Allow automatic withdrawal of unsafe or privacy-compromised public entries.

Public visitors may read only approved publications. They must never read pending submissions, review decisions, internal scores, or audit metadata.

## Security and testing requirements

- AGNES API credentials remain server-side.
- No Groq route or fallback.
- Do not write visitor content into Mia's private memory or identity systems.
- Use a dedicated server-side publisher; browser clients cannot publish or modify public entries.
- Bind approval to hashes of the exact original question, answer, language pair, and consent record.
- Test unauthorized origins, malformed requests, rate limits, prompt injection, PII, minors' data, unsafe instructions, moderation timeout, AGNES outage, output leakage, duplicate publication, withdrawal, expiry cleanup, and private-table isolation.
- Keep minimal audit metadata; do not retain rejected raw text in audit logs.
- Do not promise absence of infrastructure/security logs.

## Release gate

The public preview may be deployed while submission remains disabled. The live submission service may only be activated after isolated backend deployment, automated safety tests, publication-gate tests, and end-to-end verification all pass. No manual review of individual submissions is required; moderation and publication are fully automated.
