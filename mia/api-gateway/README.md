# MIA World Multi-API Gateway v1.0 (isolated branch)

## Purpose
A separate model-routing adapter for MIA World agents. Free/low-cost providers are tried first; AGNES AI is the final fallback. This is intentionally **not wired into** the existing Mia private chat or the current family chat Edge Functions.

## Safety boundary
- Does not read, write, migrate, or delete Supabase data.
- Does not store prompts, replies, memories, or relationship state.
- Does not modify the existing `mia-chat`, `zhi-family-chat`, `zhi-family-mia-bridge`, or `zhi-family-child-runtime` functions.
- Does not change the existing `AGNES_API_KEY` or `AGNES_MODEL` values.
- Caller must send only the minimum context needed for a task. Do not send full private histories or sensitive records to third-party providers.
- Gateway authentication uses a separate `MIA_GATEWAY_SHARED_SECRET`; never expose it in GitHub Pages or browser JavaScript.

## First provider: Groq\n\nFor the initial isolated test, configure only `GROQ_API_KEY`. If `GROQ_MODEL` is omitted, the gateway defaults to `openai/gpt-oss-20b` (confirm current availability and account limits in the Groq console). AGNES remains the last-resort fallback.\n\n## Provider secrets
Configure only after the owner chooses providers and creates their own keys. No key values belong in this repository.

| Provider | Required secrets |
|---|---|
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Groq | `GROQ_API_KEY`, `GROQ_MODEL` |
| Mistral | `MISTRAL_API_KEY`, `MISTRAL_MODEL` |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| Cloudflare Workers AI | `CLOUDFLARE_AI_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_MODEL` |
| AGNES fallback | Existing `AGNES_API_KEY`, optional `AGNES_MODEL` (defaults to `agnes-3.0-flash`) |
| Gateway authentication | New `MIA_GATEWAY_SHARED_SECRET` |

A provider is skipped when its required settings are absent. AGNES remains last in every route.

## Task routing
- chat: Groq → Gemini → Mistral → OpenRouter → Cloudflare → AGNES
- reasoning / creative / verification / planning: Gemini → Mistral → Groq → OpenRouter → Cloudflare → AGNES
- summarization: Groq → Gemini → Mistral → OpenRouter → Cloudflare → AGNES

The exact free model IDs and provider quotas must be confirmed at setup time; this module does not assume free-tier access is unlimited.

## Request contract
POST JSON:
```json
{
  "agent_id": "LUNA",
  "task_type": "reasoning",
  "messages": [
    { "role": "system", "content": "Task-specific instructions and only the necessary context." },
    { "role": "user", "content": "Question" }
  ]
}
```
Headers: `Content-Type: application/json`, `x-mia-gateway-secret: <server-side secret>`. **Backend-to-backend only:** never call this function from GitHub Pages/browser JavaScript or expose the shared secret. Production caller authentication, authorization, rate limiting, and secret handling must be completed before deployment.

The response reports the selected provider/model and fallback attempts. Upstream response bodies are not exposed. Prompts and replies are not logged or persisted.

## Deployment status
- Deployed as the isolated Supabase Edge Function `mia-api-gateway`, version 2.
- Supabase JWT verification is enabled (`verify_jwt=true`); the handler also checks `MIA_GATEWAY_SHARED_SECRET`.
- Browser CORS response headers were removed. This endpoint is not intended for direct browser use.
- No production agent or chat function calls this gateway.
- Secret values cannot be read back through the current management interface. Owner configuration of `GROQ_API_KEY` and `MIA_GATEWAY_SHARED_SECRET` has not been independently verified.
- No authenticated live Groq request or forced-failure AGNES fallback test has been run.

Before connecting any production agent:
1. verify both secrets are present in Supabase Edge Function Secrets without exposing their values;
2. create a server-side caller that holds the shared secret and passes a valid Supabase JWT;
3. add per-agent authorization, rate limiting, timeout and spend controls;
4. run isolated Groq success and AGNES fallback tests using synthetic, non-private prompts.
