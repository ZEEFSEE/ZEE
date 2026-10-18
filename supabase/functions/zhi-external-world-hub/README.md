# ZHI External World Data Hub

## Status

This source is staged for review and is **not deployed by this commit**. The live function must be checked against this source before deployment.

## Required Edge Function secrets

Configure these in Supabase Edge Function Secrets before deployment:

- `ZHI_HUB_KEY`: a newly generated secret used by the `x-zhi-hub-key` request header. Rotate the previously embedded key; never commit a key to GitHub.
- `ZHI_HUB_ALLOWED_HOSTS`: comma-separated exact domains/suffixes the Hub is allowed to fetch, for example `www.gov.sg, data.gov.sg, www.channelnewsasia.com`. Start with trusted public news/government domains and expand only after review.

Do not deploy until the new key is configured and the caller path is ready to use it.

## Actions

- `read_url`: fetches a configured, public HTTPS hostname; rejects hostnames outside the allowlist, IP literals, local/internal hostnames, redirects, non-text content, and bodies over 1.5 MB. It returns source URL, fetch time, status, content type, latency, and extracted content. It does **not** write to the database.
- `probe_news`, `probe_sports`, `pipeline`: preserve the legacy ingestion/process path and still call existing database RPCs. These are not database-write-free.

## Safety boundary

External content is untrusted reference material. It must not directly trigger movement, wallet, betting, settlement, or Life Engine actions. Agent integration should pass retrieved content as a cited observation with source URL and fetch time, then let the existing decision logic decide what to do.

## Remaining rollout steps

1. Set/rotate secrets in Supabase.
2. Review this source and deploy deliberately.
3. Add a server-side Hub caller to an agent path using the secret only on the server.
4. Test with a known allowlisted URL and verify source URL, timestamp, and content.
5. Verify an agent can cite the observation; do not claim end-to-end integration until that is observed.
