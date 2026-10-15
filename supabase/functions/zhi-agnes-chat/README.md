# Agnes AI integration for ZHI

This directory contains the server-side Edge Function source for generating an individual ZHI agent's reply with Agnes AI.

## Security

- Never put `AGNES_API_KEY` in HTML, browser JavaScript, GitHub commits, or a public `.env` file.
- Store it only as a Supabase Edge Function secret.
- The handler is intended to be admin-only and validates the existing Finance Supabase session against the configured ZHI administrator.
- It reads the selected agent's recorded traits, current mind, world position, activity, and recent memories. It writes the actual conversation to `zhi_agent_memories`, updates `zhi_agent_minds.last_thought`, and attempts to write both messages to `admin_agent_messages`.
- It does not allow Agnes to change ZHI balances, movement, relationships, or other authoritative world state.

## Configuration

In the Supabase project `jozrslgdjreepxplicen`, open **Project Settings → Edge Functions → Secrets** and add:

- `AGNES_API_KEY`: your private Agnes API key
- `AGNES_MODEL`: optional; defaults to `agnes-3.0-flash`

Agnes endpoint: `https://apihub.agnes-ai.com/v1/chat/completions`.

## Deploy

From a trusted local checkout with Supabase CLI authenticated:

```sh
supabase functions deploy zhi-agnes-chat --project-ref jozrslgdjreepxplicen
```

The function source alone does not activate the runtime. Configure the secret and deploy the function before calling it. Do not paste the key into this repository or a chat.

## Request

Send a POST to:

```
https://jozrslgdjreepxplicen.supabase.co/functions/v1/zhi-agnes-chat
```

Headers:
- `Authorization: Bearer <existing Finance Supabase admin access token>`
- `Content-Type: application/json`
- `apikey: <Core Supabase publishable key>`

Body:

```json
{
  "agent_id": "<ZHI agent UUID>",
  "message": "你今天在想什么？"
}
```

A successful response includes the agent's generated `reply` and whether conversation persistence succeeded.
