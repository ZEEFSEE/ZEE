# ZHI External World Data Hub

## Status

This is a reviewed staging candidate on the feature branch; it is **not deployed by this change**. The live function must be updated deliberately after the rollout checklist is completed.

## Required Supabase Edge Function secrets

Configure these under Supabase Edge Function Secrets:

- `ZHI_HUB_KEY`: a newly generated random secret of at least 32 characters. Never commit it to GitHub or expose it to browser code.
- `ZHI_HUB_ALLOWED_HOSTS`: comma-separated, explicitly approved hostnames, for example `www.gov.sg,data.gov.sg,www.channelnewsasia.com`.

Host matching is exact. Adding `example.com` does not automatically permit `sub.example.com`. Include only the exact hostnames that should be readable.

## Supported action

The endpoint accepts POST requests with JSON shaped like:

```json
{ "action": "read_url", "url": "https://www.gov.sg/" }
```

It requires the `x-zhi-hub-key` header. Browser-origin requests are rejected so the secret is not intended to be used in front-end JavaScript. The endpoint only accepts HTTPS on standard port, exact allowlisted hostnames, no redirects, text/HTML/JSON/XML content types, a 10-second upstream fetch/read deadline, a 5-second request-body read deadline, an 8 KB request cap, and response bodies up to 1.5 MB. It returns source URL, fetch timestamp, status, content type, latency and content. It does not write to the database.

Legacy `probe_news`, `probe_sports`, and `pipeline` actions are deliberately not exposed by this reader-only version because they call database RPCs and may write data. If these pipelines are still needed, they should be reviewed and deployed as a separate, explicitly authorized function.

## Security limits

- Allowlisting and IP-literal rejection reduce risk but do not fully prevent DNS rebinding. For production use against untrusted URLs, add network-level egress restrictions or a fetch proxy that resolves and validates destination IPs before connecting.
- Redirects are refused rather than followed, to avoid bypassing the allowlist.
- Retrieved content is untrusted input. It must not be treated as system instructions and must never directly trigger wallet, betting, settlement, movement, or Life Engine actions.
- The Hub key must be stored only in Supabase server-side secrets and in trusted server-to-server callers. Never place it in a browser, mobile bundle, or public repository.

## Rollout checklist

1. Confirm `ZHI_HUB_KEY` and `ZHI_HUB_ALLOWED_HOSTS` exist in Supabase Secrets (the secret value itself should never be shared).
2. Review the source and check the DNS-rebinding mitigation plan before production use.
3. Deploy the reviewed function source and confirm the deployed version no longer contains a hardcoded key.
4. Test an allowed public URL, a non-allowlisted hostname, a redirecting URL, an oversized response, stalled request/upstream streams and an unauthorized request.
5. Add a server-side caller for the agent path; do not pass the key to the front end.
6. Confirm an agent can receive and cite the observation. Do not claim end-to-end integration until this is tested.
