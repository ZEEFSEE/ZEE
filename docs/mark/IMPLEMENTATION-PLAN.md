# Mark general analysis contract — minimal implementation plan

## Current audited path
The current default-branch file `supabase/functions/mark-jason-group-chat/index.ts` handles both private-chat operations (including `send_private`) and group chat. In the inspected private-chat path, the system prompt is assembled inline, the model is called with `stream: false`, and the assistant reply is stored as ordinary chat text. The existing prompt already asks Mark to prioritize evidence, logic, root causes, risks, and verifiable conclusions.

The separately guessed path `supabase/functions/mark-jason-chat/index.ts` returned 404. This does not establish that no other deployment entry point exists. Verify deployment configuration before editing runtime behavior.

## Safe sequence
1. Confirm the deployed Mark private-chat entry point and deployment source.
2. Add the prompt fragment in the existing Mark private-chat path only; do not alter Jason's behavior unless separately approved.
3. Keep user-facing replies natural language. If internal structured context is added, validate it at the response boundary and do not persist it to a new table.
4. Add bounded retry/fallback and tests for EST-only delivery adaptation, evidence uncertainty, speculation labels, safety precedence, and malformed output.
5. Run lint/type checks and staging smoke tests. Confirm current chat history and memory reads remain unchanged.
6. Deploy only after review and verify the actual deployed version and rollback path.

## Non-goals and safety boundaries
- No ZHI Core dependency.
- No changes to Mia independent chat or the `zee-extension` database.
- No database/schema migration.
- No API key replacement.
- No direct edits to the default branch or automatic deployment from this draft.
- This document is not evidence of runtime integration or a successful deployment.
