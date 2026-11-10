# Echo Mailbox backend scaffold

This directory contains a **not-deployed** intake scaffold and a **design-only** SQL draft.

## Files
- `supabase/functions/echo-submit/index.ts`: strict-origin POST intake, basic validation, conservative preliminary screening, server-side queue insert.
- `supabase/design/echo-mailbox-schema.draft.sql`: isolated schema/table and RLS design. This file is not an applied migration.

## Important release blockers
1. Confirm that the production project's actual schema exposure and key model support the private schema insert path.
2. Apply a reviewed migration only after test-environment validation.
3. Add a real, documented AGNES server adapter. Do not guess the AGNES URL, request signature, or response contract.
4. Add a separate worker/reviewer flow for semantic moderation, MIA selection, response generation, output moderation, publication, and expiry cleanup.
5. Add robust abuse protection (rate limiting / bot challenge) before public launch.
6. Add automated tests for prompt injection, personal data, minors, self-harm, threats, hate, dangerous instructions, language preservation, no-response, and publication consent.
7. Confirm GitHub Pages deployment path and endpoint CORS origin before enabling the form.

## Privacy model
- Raw submission text is stored only in `echo_private.submissions` with a short expiry.
- Public reads are limited to `public.echo_publications` rows that are published and not withdrawn.
- No access to Mia private chat, memory, identity, emotion, relationship, or personality tables is implemented.
- No AGNES request is made by this scaffold.
- Do not log request bodies, prompts, or raw submissions.
