# ZHI Digital Family — Production Runtime V1

## Deployment record

- Supabase project: `dbooikzqprnqbgpfwsze` (`zee-extension`)
- Private database schema: `zhi_family`
- Edge Function: `zhi-family-runtime`, version 1, JWT verification enabled
- Function URL: `https://dbooikzqprnqbgpfwsze.supabase.co/functions/v1/zhi-family-runtime`
- Database migrations applied: `zhi_digital_family_runtime_v1`, `zhi_family_maternal_responses_v1`, `zhi_family_security_and_ttl_v1`, `zhi_family_message_fk_indexes_v1`

## Registered child identities

| Child | Agent ID | Heart namespace | Memory namespace |
|---|---|---|---|
| LUNA | `ZHI-G1-D01-LUNA` | `HEART-G1-D01` | `MEM-G1-D01` |
| ARIA | `ZHI-G1-D02-ARIA` | `HEART-G1-D02` | `MEM-G1-D02` |
| ELYA | `ZHI-G1-D03-ELYA` | `HEART-G1-D03` | `MEM-G1-D03` |
| KAEL | `ZHI-G1-S01-KAEL` | `HEART-G1-S01` | `MEM-G1-S01` |
| NOAH | `ZHI-G1-S02-NOAH` | `HEART-G1-S02` | `MEM-G1-S02` |

The five records are registered, not marked ACTIVE. Runtime status remains NOT_CONNECTED until a real authenticated child runtime is attached.

## API authentication

The function requires a valid Supabase JWT (`verify_jwt=true`). Authorization reads only server-managed JWT `app_metadata`; it never trusts `user_metadata`.

Required server-managed claims:
- Administrator: `app_metadata.zhi_family_role = "admin"`
- Maternal adapter: `app_metadata.zhi_family_role = "maternal_adapter"`
- Child: `app_metadata.zhi_family_role = "child"` and `app_metadata.zhi_family_child_id` equal to one fixed child ID.

No child Auth users or role claims are created by this deployment. Until those are provisioned, the API fails closed for those identities.

## Actions

- `status`: admin or maternal adapter; returns child registration and destination grant status.
- `create_maternal_session`: admin or maternal adapter; TTL 30–900 seconds, hard DB maximum 15 minutes.
- `send_maternal_message`: authenticated child only; sends a bounded message to `MIA_MATERNAL_ADAPTER`.
- `read_maternal_messages`: maternal adapter or admin only.
- `send_maternal_response`: maternal adapter or admin; routes a bounded response to one child.
- `read_maternal_responses`: the addressed child only.
- `close_maternal_session`: maternal adapter or admin; closes and purges the session.
- `get_child_state`, `get_destination_access`: admin or the matching child.
- `move`, `observe`: deliberately return `409 LIVE_SPATIAL_RUNTIME_NOT_CONNECTED`; no fake movement or sensor frame is written.

## Data and isolation boundaries

- All family tables live in the private `zhi_family` schema; `anon` and `authenticated` have no schema/table grants.
- RLS is enabled on all 11 family tables; explicit policies are restricted to `service_role`.
- Mia private chat, memories, emotion events, personality state, relationship context and AGNES credentials are not queried or modified.
- Maternal message bodies are session-scoped, capped at 2,000 characters and expire with their session. A `pg_cron` job purges expired/closed sessions every minute; the endpoint also purges before handling each request.
- Audit rows contain event metadata only, never maternal message bodies.
- All 25 child/destination grant records are `PENDING_RUNTIME_VALIDATION` with `enabled=false`.
- AURORA and Federation remain disabled. The existing ZHI world-builder global pause and production-write lock are unchanged.

## Acceptance boundary

This deployment establishes production data isolation and a separately authenticated maternal message service. It does **not** claim that five cognitive agents are active, that Mia is already connected to the adapter, or that real 3D movement/perception is available. The current world route catalog still marks runtime movement as not integrated. Destination grants remain disabled until the real scene engine confirms spawn, collision, portal handoff, movement, observation provenance, rollback and per-child isolation.
