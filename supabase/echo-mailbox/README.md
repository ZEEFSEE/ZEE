# Echo Mailbox backend status

The endpoint in this repository is deliberately **fail-closed** and is not deployed to Supabase. It returns `503 mailbox_not_live` without parsing, logging, forwarding, or persisting visitor content.

The SQL file under `supabase/design/` is design material only. It has not been applied to any database.

Before enabling public submissions, implement and test all of the following in an isolated Supabase environment:

1. Dedicated schema and tables with explicit non-exposure from PostgREST.
2. Server-only AGNES integration using the already verified production-compatible protocol:
   - endpoint: `https://apihub.agnes-ai.com/v1/chat/completions`
   - authorization: server-side `AGNES_API_KEY`
   - request contract: OpenAI-compatible chat completions
   - model: configured server-side; no Groq fallback.
3. Automated input safety/privacy checks and abuse throttling.
4. AGNES semantic selection with a valid no-answer result.
5. Mia reply generation only for selected submissions.
6. Automated output safety/privacy checks over both the original submission and generated reply.
7. A publication gate bound to content hashes, language, and publication consent.
8. Public read-only access to approved, non-withdrawn publications; no public access to queues or moderation metadata.
9. Expiry cleanup for non-selected submissions and automatic withdrawal support.
10. Automated tests for failure, timeout, duplicate, tampering, prompt injection, PII, minors, unsafe requests, and private-data isolation.

All errors, timeouts, missing checks, and uncertain moderation outcomes must fail closed. No manual review of individual submissions is part of the product workflow; the automated system must reject or discard uncertain items.

## Private MIA isolation

Never read or write Mia's private identity, chat, memory, emotion, relationship, life-event, or personality tables. The public mailbox is a separate product context and must not alter Mia's private continuity or personality state.
