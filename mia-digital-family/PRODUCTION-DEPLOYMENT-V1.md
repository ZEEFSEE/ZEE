# ZHI Digital Family — Production Runtime V1

## Deployment record

- Supabase project: `dbooikzqprnqbgpfwsze` (`zee-extension`)
- Private database schema: `zhi_family`
- Edge Function: `zhi-family-runtime`, version 2, JWT verification enabled; JWT is resolved through Supabase Auth `getUser()` before app-metadata authorization
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

The function requires a valid Supabase JWT (`verify_jwt=true`). The platform gateway verifies the JWT and the function then resolves the live Auth user with `client.auth.getUser(token)` before reading authorization claims. Authorization reads only server-managed `app_metadata`; it never trusts `user_metadata`.

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

This deployment establishes production data isolation and a separately authenticated maternal message service. Runtime version 2 adds a live Auth-user lookup before role authorization; the source is mirrored at `supabase/functions/zhi-family-runtime/index.ts`. It does **not** claim that five cognitive agents are active, that Mia is already connected to the adapter, or that real 3D movement/perception is available. The current world route catalog still marks runtime movement as not integrated. Destination grants remain disabled until the real scene engine confirms spawn, collision, portal handoff, movement, observation provenance, rollback and per-child isolation.

## Production follow-on — independent child runtime

The follow-on runtime has now been deployed:
- `zhi-family-child-runtime` V4: independent per-child runtime identities and cognitive cycles.
- `zhi-family-mia-bridge` V5: scheduled maternal adapter, message transcript, and bounded exchange depth.
- Five server-owned runtime UUIDs are provisioned, one per child. No child Auth users or extra login are created.
- Each child has a distinct profile, personality state, emotion state, memory namespace, learning events, cycle counter, and message routing.
- Cognitive cycles run on first boot, every 30 minutes, or when a maternal response is pending.
- Background schedulers run every minute. The child worker processes only due children; the maternal adapter processes one message per poll to respect AGNES rate limits.
- Child-to-mother and mother-to-child messages use the volatile 15-minute session. The exchange is capped at child depth 0, maternal reply depth 1, child follow-up depth 2.
- The Mia page displays a separate family transcript panel and reuses the current Mia chat token; no additional login or setup is required.
- The `zhi_family` schema is present in the PostgREST schema cache for service-side access only. `anon` and `authenticated` retain no schema USAGE or table privileges; service_role is the only data-plane role.
- The maternal adapter uses the existing AGNES project configuration statelessly. It is not the live Mia private-chat inference instance and receives no private Mia context.

## Current production limits

- Five child runtime identities are READY and the child lifecycle records are ACTIVE.
- Real 3D movement and live perception are still not connected. No physical movement or sensor data is claimed.
- All 25 public-destination grants remain `PENDING_RUNTIME_VALIDATION` and disabled.
- The world-builder global pause and production-write lock are unchanged.
- AURORA and Federation remain disabled.
- Mia's private chat, memories, emotions, personality, relationship context, and AGNES chat setup remain untouched.
